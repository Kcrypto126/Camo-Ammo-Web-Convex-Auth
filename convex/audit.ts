import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

// Helper function to get current user with fallback lookup
async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    console.log("[getCurrentUser] No identity found");
    return null;
  }

  // Look up by email first (preferred method)
  if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (user) {
      console.log("[getCurrentUser] Found user by email:", identity.email);
      return user;
    } else {
      console.log(
        "[getCurrentUser] User not found by email, trying subject fallback:",
        identity.email,
      );
    }
  }

  // Fall back to subject-based lookup if email lookup failed
  if (identity.subject) {
    const parts = identity.subject.split("|");
    if (parts.length > 0) {
      try {
        const userId = parts[0] as Id<"users">;
        const user = await ctx.db.get(userId);
        if (user) {
          console.log(
            "[getCurrentUser] Found user by subject:",
            identity.subject,
          );
          return user;
        }
      } catch (error) {
        // Subject is not a valid Convex ID, continue
        console.log("[getCurrentUser] Subject is not a valid Convex ID", {
          subject: identity.subject,
          error,
        });
      }
    }
  }

  console.log("[getCurrentUser] No user found for identity:", {
    email: identity.email,
    subject: identity.subject,
  });
  return null;
}

// Log an audit event
export const logAudit = mutation({
  args: {
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    changes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[logAudit] Starting audit log");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log(
        "[logAudit] User not found or not authenticated, skipping log",
      );
      return; // Skip logging if not authenticated or user not found
    }
    console.log("[logAudit] User found:", user._id);

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      changes: args.changes,
      timestamp: Date.now(),
    });
  },
});

// Search audit logs (admin only)
export const searchAuditLogs = query({
  args: {
    searchTerm: v.optional(v.string()),
    entityType: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log("[searchAuditLogs] Starting audit log search");
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      console.log("[searchAuditLogs] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[searchAuditLogs] User found:", currentUser._id);

    if (currentUser.role !== "owner" && currentUser.role !== "admin") {
      console.log("[searchAuditLogs] User not authorized");
      throw new ConvexError({
        message: "Not authorized",
        code: "FORBIDDEN",
      });
    }

    // Get all logs sorted by timestamp descending
    let logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit || 100);

    // Filter by date range if provided
    if (args.startDate || args.endDate) {
      logs = logs.filter((log) => {
        const timestamp = log.timestamp;
        if (args.startDate && timestamp < args.startDate) return false;
        if (args.endDate && timestamp > args.endDate) return false;
        return true;
      });
    }

    // Filter by entity type if provided
    if (args.entityType) {
      logs = logs.filter((log) => log.entityType === args.entityType);
    }

    // Get user information for each log and filter by search term
    const logsWithUsers = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: user?.name || "Unknown",
          userEmail: user?.email || "",
          userPhone: user?.phoneNumber || "",
          memberNumber: user?.memberNumber || "",
        };
      }),
    );

    // Apply search term filter if provided
    if (args.searchTerm && args.searchTerm.trim() !== "") {
      const searchLower = args.searchTerm.toLowerCase();
      return logsWithUsers.filter((log) => {
        return (
          log.userName.toLowerCase().includes(searchLower) ||
          log.userEmail.toLowerCase().includes(searchLower) ||
          log.userPhone.includes(args.searchTerm!) ||
          log.memberNumber.toLowerCase().includes(searchLower) ||
          log.action.toLowerCase().includes(searchLower)
        );
      });
    }

    return logsWithUsers;
  },
});

// Get audit logs for a specific user (admin only)
export const getUserAuditLogs = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log("[getUserAuditLogs] Starting user audit log query");
    const currentUser = await getCurrentUser(ctx);
    if (!currentUser) {
      console.log("[getUserAuditLogs] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[getUserAuditLogs] User found:", currentUser._id);

    if (currentUser.role !== "owner" && currentUser.role !== "admin") {
      console.log("[getUserAuditLogs] User not authorized");
      throw new ConvexError({
        message: "Not authorized",
        code: "FORBIDDEN",
      });
    }

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_user_timestamp", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit || 50);

    const user = await ctx.db.get(args.userId);

    return logs.map((log) => ({
      ...log,
      userName: user?.name || "Unknown",
      userEmail: user?.email || "",
      memberNumber: user?.memberNumber || "",
    }));
  },
});
