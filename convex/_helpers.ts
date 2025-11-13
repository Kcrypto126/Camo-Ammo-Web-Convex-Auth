import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";

/**
 * Helper function to get current authenticated user
 * Returns null if not authenticated
 */
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await ctx.auth.getUserIdentity();
  if (!userId) {
    return null;
  }
  return await ctx.db.get(userId.subject as Id<"users">);
}

/**
 * Helper function to require authentication
 * Throws UNAUTHENTICATED error if not authenticated
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({
      message: "User not logged in",
      code: "UNAUTHENTICATED",
    });
  }
  return user;
}

/**
 * Helper function to require admin or owner role
 * Throws FORBIDDEN error if user is not admin or owner
 */
export async function requireAdminOrOwner(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "owner" && user.role !== "admin") {
    throw new ConvexError({
      message: "Not authorized",
      code: "FORBIDDEN",
    });
  }
  return user;
}

/**
 * Helper function to require owner role
 * Throws FORBIDDEN error if user is not owner
 */
export async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const user = await requireAuth(ctx);
  if (user.role !== "owner") {
    throw new ConvexError({
      message: "Only owners can perform this action",
      code: "FORBIDDEN",
    });
  }
  return user;
}

/**
 * Get current user ID from auth identity
 * Returns null if not authenticated
 */
export async function getCurrentUserId(ctx: QueryCtx | MutationCtx): Promise<Id<"users"> | null> {
  const userId = await ctx.auth.getUserIdentity();
  if (!userId) {
    return null;
  }
  return userId.subject as Id<"users">;
}
