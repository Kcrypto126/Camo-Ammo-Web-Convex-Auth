import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel.d.ts";
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

export const startTrack = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[startTrack] Starting track creation");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log("[startTrack] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[startTrack] User found:", user._id);

    const trackId = await ctx.db.insert("tracks", {
      userId: user._id,
      name: args.name,
      description: args.description,
      distance: 0,
      duration: 0,
      coordinates: [],
      startTime: Date.now(),
      endTime: Date.now(),
      isActive: true,
    });

    return trackId;
  },
});

export const addTrackPoint = mutation({
  args: {
    trackId: v.id("tracks"),
    lat: v.number(),
    lng: v.number(),
    altitude: v.optional(v.number()),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.log("[addTrackPoint] Starting point addition");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log("[addTrackPoint] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[addTrackPoint] User found:", user._id);

    const track = await ctx.db.get(args.trackId);
    if (!track) {
      throw new ConvexError({
        message: "Track not found",
        code: "NOT_FOUND",
      });
    }

    // Verify user owns the track
    if (track.userId !== user._id) {
      console.log("[addTrackPoint] User does not own track");
      throw new ConvexError({
        message: "Not authorized to add points to this track",
        code: "FORBIDDEN",
      });
    }

    if (!track.isActive) {
      throw new ConvexError({
        message: "Cannot add points to inactive track",
        code: "BAD_REQUEST",
      });
    }

    const newPoint = {
      lat: args.lat,
      lng: args.lng,
      timestamp: Date.now(),
      altitude: args.altitude,
      accuracy: args.accuracy,
    };

    const coordinates = [...track.coordinates, newPoint];

    // Calculate distance if we have previous point
    let distance = track.distance;
    if (track.coordinates.length > 0) {
      const lastPoint = track.coordinates[track.coordinates.length - 1];
      distance += calculateDistance(
        lastPoint.lat,
        lastPoint.lng,
        args.lat,
        args.lng,
      );
    }

    await ctx.db.patch(args.trackId, {
      coordinates,
      distance,
      endTime: Date.now(),
    });

    return { success: true };
  },
});

export const stopTrack = mutation({
  args: {
    trackId: v.id("tracks"),
  },
  handler: async (ctx, args) => {
    console.log("[stopTrack] Starting track stop");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log("[stopTrack] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[stopTrack] User found:", user._id);

    const track = await ctx.db.get(args.trackId);
    if (!track) {
      throw new ConvexError({
        message: "Track not found",
        code: "NOT_FOUND",
      });
    }

    // Verify user owns the track
    if (track.userId !== user._id) {
      console.log("[stopTrack] User does not own track");
      throw new ConvexError({
        message: "Not authorized to stop this track",
        code: "FORBIDDEN",
      });
    }

    // Calculate final statistics
    const duration = (track.endTime - track.startTime) / 1000; // seconds
    const averageSpeed = duration > 0 ? track.distance / duration : 0;

    // Calculate elevation changes
    let elevationGain = 0;
    let elevationLoss = 0;

    for (let i = 1; i < track.coordinates.length; i++) {
      const prev = track.coordinates[i - 1];
      const curr = track.coordinates[i];

      if (prev.altitude && curr.altitude) {
        const diff = curr.altitude - prev.altitude;
        if (diff > 0) {
          elevationGain += diff;
        } else {
          elevationLoss += Math.abs(diff);
        }
      }
    }

    await ctx.db.patch(args.trackId, {
      isActive: false,
      duration,
      averageSpeed,
      elevationGain: elevationGain > 0 ? elevationGain : undefined,
      elevationLoss: elevationLoss > 0 ? elevationLoss : undefined,
    });

    return { success: true };
  },
});

export const getMyTracks = query({
  args: {},
  handler: async (ctx) => {
    console.log("[getMyTracks] Starting query");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log(
        "[getMyTracks] User not found or not authenticated, returning empty array",
      );
      return [];
    }
    console.log("[getMyTracks] User found:", user._id);

    return await ctx.db
      .query("tracks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const getActiveTrack = query({
  args: {},
  handler: async (ctx) => {
    console.log("[getActiveTrack] Starting query");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log(
        "[getActiveTrack] User not found or not authenticated, returning null",
      );
      return null;
    }
    console.log("[getActiveTrack] User found:", user._id);

    return await ctx.db
      .query("tracks")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isActive", true),
      )
      .first();
  },
});

export const deleteTrack = mutation({
  args: { trackId: v.id("tracks") },
  handler: async (ctx, args) => {
    console.log("[deleteTrack] Starting track deletion");
    const user = await getCurrentUser(ctx);
    if (!user) {
      console.log("[deleteTrack] User not found or not authenticated");
      throw new ConvexError({
        message: "User not logged in",
        code: "UNAUTHENTICATED",
      });
    }
    console.log("[deleteTrack] User found:", user._id);

    const track = await ctx.db.get(args.trackId);
    if (!track) {
      throw new ConvexError({
        message: "Track not found",
        code: "NOT_FOUND",
      });
    }

    // Verify user owns the track
    if (track.userId !== user._id) {
      console.log("[deleteTrack] User does not own track");
      throw new ConvexError({
        message: "Not authorized to delete this track",
        code: "FORBIDDEN",
      });
    }

    await ctx.db.delete(args.trackId);
    return { success: true };
  },
});

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
