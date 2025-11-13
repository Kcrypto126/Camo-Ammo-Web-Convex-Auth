import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ConvexError } from "convex/values";
import { requireAuth } from "./_helpers";

// Register that a user is viewing an item
export const registerViewer = mutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Check if viewer record already exists
    const existing = await ctx.db
      .query("activeViewers")
      .withIndex("by_entity_user", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId).eq("userId", user._id)
      )
      .unique();

    if (existing) {
      // Update last active time
      await ctx.db.patch(existing._id, { lastActiveAt: Date.now() });
    } else {
      // Create new viewer record
      await ctx.db.insert("activeViewers", {
        entityType: args.entityType,
        entityId: args.entityId,
        userId: user._id,
        lastActiveAt: Date.now(),
      });
    }

    return user._id;
  },
});

// Unregister a viewer
export const unregisterViewer = mutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    const existing = await ctx.db
      .query("activeViewers")
      .withIndex("by_entity_user", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId).eq("userId", user._id)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Get active viewers for an item (admin only)
export const getActiveViewers = query({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);

    // Get all active viewers (active within last 30 seconds)
    const thirtySecondsAgo = Date.now() - 30 * 1000;
    const viewers = await ctx.db
      .query("activeViewers")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId)
      )
      .filter((q) => q.gte(q.field("lastActiveAt"), thirtySecondsAgo))
      .collect();

    // Get user info for each viewer
    const viewersWithInfo = await Promise.all(
      viewers.map(async (viewer) => {
        const viewerUser = await ctx.db.get(viewer.userId);
        return {
          ...viewer,
          name: viewerUser?.name || "Unknown",
          email: viewerUser?.email || "",
        };
      })
    );

    // Exclude current user from list
    return viewersWithInfo.filter((v) => v.userId !== user._id);
  },
});

// Clean up stale viewer records (called periodically)
export const cleanupStaleViewers = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Remove records older than 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const staleViewers = await ctx.db
      .query("activeViewers")
      .withIndex("by_last_active")
      .filter((q) => q.lt(q.field("lastActiveAt"), fiveMinutesAgo))
      .collect();

    for (const viewer of staleViewers) {
      await ctx.db.delete(viewer._id);
    }

    return { deleted: staleViewers.length };
  },
});
