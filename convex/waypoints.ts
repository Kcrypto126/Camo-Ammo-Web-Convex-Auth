import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

// Helper function to get current user with fallback lookup
async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  // Look up by email first (preferred method)
  if (identity.email) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (user) {
      return user;
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
          return user;
        }
      } catch (error) {
        // Subject is not a valid Convex ID, continue
        console.log("[getCurrentUser] Subject is not a valid Convex ID", {
          subject: identity.subject,
        });
      }
    }
  }

  return null;
}

export const createWaypoint = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    lat: v.number(),
    lng: v.number(),
    altitude: v.optional(v.number()),
    type: v.string(),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    trackId: v.optional(v.id("tracks")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        message: "User not found. Please ensure your account has been created.",
        code: "NOT_FOUND",
      });
    }

    const waypointId = await ctx.db.insert("waypoints", {
      userId: user._id,
      name: args.name,
      description: args.description,
      lat: args.lat,
      lng: args.lng,
      altitude: args.altitude,
      type: args.type,
      icon: args.icon,
      color: args.color,
      trackId: args.trackId,
      createdAt: Date.now(),
    });

    return waypointId;
  },
});

export const getMyWaypoints = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("waypoints")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const deleteWaypoint = mutation({
  args: { waypointId: v.id("waypoints") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        message: "User not found. Please ensure your account has been created.",
        code: "NOT_FOUND",
      });
    }

    const waypoint = await ctx.db.get(args.waypointId);
    if (!waypoint) {
      throw new ConvexError({
        message: "Waypoint not found",
        code: "NOT_FOUND",
      });
    }

    // Verify ownership
    if (waypoint.userId !== user._id) {
      throw new ConvexError({
        message: "Not authorized to delete this waypoint",
        code: "FORBIDDEN",
      });
    }

    await ctx.db.delete(args.waypointId);
    return { success: true };
  },
});

export const updateWaypoint = mutation({
  args: {
    waypointId: v.id("waypoints"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        message: "User not found. Please ensure your account has been created.",
        code: "NOT_FOUND",
      });
    }

    const waypoint = await ctx.db.get(args.waypointId);
    if (!waypoint) {
      throw new ConvexError({
        message: "Waypoint not found",
        code: "NOT_FOUND",
      });
    }

    // Verify ownership
    if (waypoint.userId !== user._id) {
      throw new ConvexError({
        message: "Not authorized to update this waypoint",
        code: "FORBIDDEN",
      });
    }

    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.type !== undefined) updates.type = args.type;
    if (args.icon !== undefined) updates.icon = args.icon;
    if (args.color !== undefined) updates.color = args.color;

    await ctx.db.patch(args.waypointId, updates);
    return { success: true };
  },
});
