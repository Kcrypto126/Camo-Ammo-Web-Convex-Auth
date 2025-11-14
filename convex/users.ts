import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel.d.ts";

// Super admin email
const SUPER_ADMIN_EMAIL = "rex@diazcorporations.com";

// Generate unique member number
async function generateMemberNumber(
  ctx: GenericMutationCtx<DataModel>,
): Promise<string> {
  // Get the count of all users (including archived)
  const allUsers = await ctx.db.query("users").collect();
  const nextNumber = allUsers.length + 1;

  // Format as M-00001, M-00002, etc.
  const memberNumber = `M-${nextNumber.toString().padStart(5, "0")}`;

  // Check if this number already exists (shouldn't happen, but be safe)
  const existing = allUsers.find((u) => u.memberNumber === memberNumber);
  if (existing) {
    // If it exists, try the next number
    return `M-${(nextNumber + 1).toString().padStart(5, "0")}`;
  }

  return memberNumber;
}

// Default permissions for each role
const DEFAULT_PERMISSIONS = {
  owner: [
    "view_users",
    "edit_users",
    "delete_users",
    "ban_users",
    "manage_roles",
    "moderate_forums",
    "moderate_marketplace",
    "manage_subscriptions",
    "view_analytics",
  ],
  admin: [
    "view_users",
    "edit_users",
    "ban_users",
    "moderate_forums",
    "moderate_marketplace",
    "view_analytics",
  ],
  member: [],
};

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.log("[updateCurrentUser] No identity found");
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "User not logged in",
      });
    }

    // Get email from identity
    const email = identity.email;

    if (!email) {
      console.log("[updateCurrentUser] Identity found but no email available", {
        hasSubject: !!identity.subject,
        hasName: !!identity.name,
        hasPictureUrl: !!identity.pictureUrl,
      });

      // If email isn't available, check if auth callbacks have already created a user
      // We can't query by subject (it's not a valid ID), so we'll just return null
      // and let the auth callbacks handle user creation, or the component can check
      // if a user exists via getCurrentUser query
      console.log(
        "[updateCurrentUser] Email not available - auth callbacks will handle user creation",
      );
      return null;
    }

    console.log("[updateCurrentUser] Processing user", {
      email: email,
    });

    // Look up user by email (JWT subject is not a Convex document ID)
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();

    if (existingUser !== null) {
      // Update email and name if changed
      const updates: Partial<{
        email: string;
        name: string;
        avatar: string;
      }> = {};

      if (existingUser.email !== email) {
        updates.email = email;
      }
      if (identity.name && existingUser.name !== identity.name) {
        updates.name = identity.name;
      }
      if (identity.pictureUrl && existingUser.avatar !== identity.pictureUrl) {
        updates.avatar = identity.pictureUrl;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(existingUser._id, updates);
      }
      return existingUser._id;
    }

    // Determine role: owner if super admin email, otherwise member
    const role = email === SUPER_ADMIN_EMAIL ? "owner" : "member";
    const permissions = DEFAULT_PERMISSIONS[role];

    // Generate unique member number
    const memberNumber = await generateMemberNumber(ctx);

    // Create new user
    const newUserId = await ctx.db.insert("users", {
      name: identity.name || undefined,
      email: email,
      avatar: identity.pictureUrl || undefined,
      role,
      permissions,
      memberNumber,
      profileCompleted: false, // New users must complete their profile
    });

    // Log the account creation
    await ctx.db.insert("auditLogs", {
      userId: newUserId,
      action: "Account created",
      entityType: "user",
      entityId: newUserId,
      timestamp: Date.now(),
    });

    return newUserId;
  },
});

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      // No identity - return null instead of throwing
      return null;
    }

    // Preferred: Look up by email, if available
    if (identity.email) {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", identity.email!))
        .unique();

      if (user?.accountAccessRestricted) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message:
            "Your account is currently under review. Please wait at least 24-48 hours before submitting a support ticket.",
        });
      }
      return user;
    }

    // Otherwise, fall back to subject-based lookup (if possible)
    // e.g., subject is "<userId>|<provider>"
    if (identity.subject) {
      const userId = identity.subject.split("|")[0] as Id<"users">;
      const user = await ctx.db.get(userId);

      if (user?.accountAccessRestricted) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message:
            "Your account is currently under review. Please wait at least 24-48 hours before submitting a support ticket.",
        });
      }
      return user;
    }

    // Should not reach here. If so, log for diagnostics and return null.
    console.log(
      "[getCurrentUser] No email or subject in identity, waiting for auth callbacks",
    );
    return null;
  },
});

// Migration: Add member numbers to existing users
export const addMemberNumbersToExistingUsers = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "User not logged in",
      });
    }

    // Only allow owners to run this migration
    // Look up user by email (JWT subject is not a Convex document ID)
    const currentUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!currentUser || currentUser.role !== "owner") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only owners can run this migration",
      });
    }

    // Get all users without member numbers
    const allUsers = await ctx.db.query("users").collect();
    const usersWithoutNumbers = allUsers.filter((u) => !u.memberNumber);

    let count = 0;
    for (const user of usersWithoutNumbers) {
      const memberNumber = await generateMemberNumber(ctx);
      await ctx.db.patch(user._id, { memberNumber });
      count++;
    }

    return {
      message: `Successfully added member numbers to ${count} users`,
      updated: count,
    };
  },
});
