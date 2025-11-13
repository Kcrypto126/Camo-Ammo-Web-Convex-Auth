import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel, Id } from "./_generated/dataModel.d.ts";
import type { GenericMutationCtx } from "convex/server";
import { mutation } from "./_generated/server";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const siteUrl = process.env.SITE_URL;
const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;

// Log configuration status
console.log("[Auth] Configuration check:", {
  hasGoogleClientId: !!googleClientId,
  hasGoogleClientSecret: !!googleClientSecret,
  hasSiteUrl: !!siteUrl,
  hasJwtPrivateKey: !!jwtPrivateKey,
  jwtPrivateKeyLength: jwtPrivateKey?.length || 0,
});

// Super admin email
// const SUPER_ADMIN_EMAIL = "rex@diazcorporations.com";
const SUPER_ADMIN_EMAIL = "superdev19782@gmail.com";

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

// Generate unique member number
async function generateMemberNumber(
  ctx: GenericMutationCtx<DataModel>,
): Promise<string> {
  const allUsers = await ctx.db.query("users").collect();
  const nextNumber = allUsers.length + 1;
  const memberNumber = `M-${nextNumber.toString().padStart(5, "0")}`;
  const existing = allUsers.find((u) => u.memberNumber === memberNumber);
  if (existing) {
    return `M-${(nextNumber + 1).toString().padStart(5, "0")}`;
  }
  return memberNumber;
}

// Build providers array - only include providers with valid credentials
const providers = [];

// Add Google provider only if credentials are configured
// CRITICAL: Both must be non-empty strings, not just truthy
const hasGoogleCredentials =
  googleClientId &&
  googleClientSecret &&
  typeof googleClientId === "string" &&
  typeof googleClientSecret === "string" &&
  googleClientId.trim().length > 0 &&
  googleClientSecret.trim().length > 0;

if (hasGoogleCredentials) {
  console.log("[Auth] ✓ Google provider configured");
  try {
    const googleProvider = Google({
      clientId: googleClientId!,
      clientSecret: googleClientSecret!,
      // Ensure we request email scope
      authorization: {
        params: {
          scope: "openid email profile",
        },
      },
      // Explicitly map profile fields to ensure email is included
      profile(profile) {
        console.log("[Auth] Google profile received:", {
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          sub: profile.sub,
          email_verified: profile.email_verified,
        });
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          picture: profile.picture,
          emailVerified: profile.email_verified ?? true,
        };
      },
    });
    providers.push(googleProvider);
  } catch (error) {
    console.error("[Auth] ✗ Failed to create Google provider:", error);
  }
} else {
  console.warn(
    "[Auth] ⚠ Google provider skipped - missing or invalid credentials",
  );
  console.warn(
    "[Auth] GOOGLE_CLIENT_ID:",
    googleClientId
      ? `✗ invalid (type: ${typeof googleClientId}, length: ${String(googleClientId).length})`
      : "✗ missing",
  );
  console.warn(
    "[Auth] GOOGLE_CLIENT_SECRET:",
    googleClientSecret
      ? `✗ invalid (type: ${typeof googleClientSecret}, length: ${String(googleClientSecret).length})`
      : "✗ missing",
  );
}

// Add Password provider (always available)
try {
  const passwordProvider = Password({
    profile(params) {
      return {
        email: params.email as string,
        name: params.name as string,
      };
    },
  });
  providers.push(passwordProvider);
  console.log("[Auth] ✓ Password provider configured");
} catch (error) {
  console.error("[Auth] ✗ Failed to create Password provider:", error);
}

// Log provider details for debugging
console.log(`[Auth] ✓ Configured ${providers.length} provider(s):`);
providers.forEach((provider, index) => {
  const providerId = provider.id || "unknown";
  const providerType = provider.type || "unknown";
  console.log(
    `[Auth]   Provider ${index + 1}: id="${providerId}", type="${providerType}"`,
  );
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers,
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      console.log("[Auth] createOrUpdateUser callback triggered", {
        existingUserId: args.existingUserId,
        email: args.profile?.email,
        name: args.profile?.name,
        picture: args.profile?.picture,
        image: args.profile?.image,
        type: args.type,
        profileKeys: Object.keys(args.profile || {}),
      });

      const email = args.profile?.email;
      const name = args.profile?.name;
      const pictureUrl = args.profile?.picture || args.profile?.image;
      const emailVerified = args.profile?.emailVerified ?? false;
      const phoneVerified = args.profile?.phoneVerified ?? false;

      // If user already exists, update it
      if (args.existingUserId) {
        const existingUser = await ctx.db.get(args.existingUserId);
        if (existingUser) {
          // Clean up: Remove 'image' field if it exists (migration cleanup)
          const userAny = existingUser as any;
          const needsImageCleanup =
            "image" in userAny && userAny.image !== undefined;

          const updates: Partial<{
            email: string;
            name: string;
            avatar: string;
            emailVerificationTime: number;
            phoneVerificationTime: number;
          }> = {};

          if (email && existingUser.email !== email) {
            updates.email = email as string;
          }
          if (name && existingUser.name !== name) {
            updates.name = name as string;
          }
          if (pictureUrl && existingUser.avatar !== pictureUrl) {
            updates.avatar = pictureUrl as string;
          }
          if (emailVerified && !existingUser.emailVerificationTime) {
            updates.emailVerificationTime = Date.now();
          }
          if (phoneVerified && !existingUser.phoneVerificationTime) {
            updates.phoneVerificationTime = Date.now();
          }

          // If image field exists, remove it by replacing the document
          if (needsImageCleanup) {
            console.log(
              `[Auth] Removing 'image' field from user ${args.existingUserId}`,
            );
            const { image, ...userWithoutImage } = userAny;
            await ctx.db.replace(args.existingUserId, {
              ...userWithoutImage,
              ...updates,
            });
          } else if (Object.keys(updates).length > 0) {
            await ctx.db.patch(args.existingUserId, updates);
          }
          return args.existingUserId;
        }
      }

      // Create new user
      // CRITICAL: Email is required to create a user
      if (!email) {
        console.error("[Auth] Cannot create user without email", {
          profile: args.profile,
          type: args.type,
          profileKeys: Object.keys(args.profile || {}),
        });
        throw new Error("Email is required to create a user account");
      }

      console.log("[Auth] Creating new user", { email, name });

      // Determine role: owner if super admin email, otherwise member
      const role = email === SUPER_ADMIN_EMAIL ? "owner" : "member";
      const permissions = DEFAULT_PERMISSIONS[role];

      // Generate unique member number
      const memberNumber = await generateMemberNumber(ctx);

      // Create user with all required fields
      // Map image/picture to avatar for consistency
      const userId = await ctx.db.insert("users", {
        name: name || undefined,
        email: email,
        avatar: pictureUrl || undefined,
        role,
        permissions,
        memberNumber,
        profileCompleted: false,
        ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
        ...(phoneVerified ? { phoneVerificationTime: Date.now() } : {}),
      });

      // Log the account creation
      await ctx.db.insert("auditLogs", {
        userId,
        action: "Account created",
        entityType: "user",
        entityId: userId,
        timestamp: Date.now(),
      });

      console.log("[Auth] User created successfully", { userId, email, role });
      return userId;
    },
    async afterUserCreatedOrUpdated(
      ctx,
      args: {
        userId: Id<"users">;
        existingUserId: Id<"users"> | null;
        type: "oauth" | "credentials" | "email" | "phone" | "verification";
        provider: any;
        profile: Record<string, unknown> & {
          email?: string;
          phone?: string;
          emailVerified?: boolean;
          phoneVerified?: boolean;
          name?: string;
          picture?: string;
          image?: string;
        };
      },
    ) {
      console.log("[Auth] afterUserCreatedOrUpdated callback triggered", {
        userId: args.userId,
        existingUserId: args.existingUserId,
        email: args.profile?.email,
        name: args.profile?.name,
        picture: args.profile?.picture,
        image: args.profile?.image,
        type: args.type,
        profileKeys: Object.keys(args.profile || {}),
      });

      // The user should already be created/updated in createOrUpdateUser
      // This callback is just for any additional post-processing
      // Only do cleanup if we have a valid user ID
      if (!args.userId) {
        console.log("[Auth] No userId in afterUserCreatedOrUpdated, skipping");
        return;
      }

      try {
        const userId = args.userId;

        // Validate ID format before using it
        // Convex IDs are base32 encoded strings of specific length
        if (typeof userId !== "string" || userId.length < 10) {
          console.warn(
            "[Auth] Invalid userId format in afterUserCreatedOrUpdated",
            { userId, type: typeof userId },
          );
          return;
        }

        const existingUser = await ctx.db.get(userId);

        if (existingUser !== null) {
          console.log("[Auth] User verified in afterUserCreatedOrUpdated", {
            userId,
            email: existingUser.email,
          });

          // Clean up: Remove 'image' field if it exists (migration cleanup)
          const userAny = existingUser as any;
          if ("image" in userAny && userAny.image !== undefined) {
            console.log(`[Auth] Removing 'image' field from user ${userId}`);
            const { image, ...userWithoutImage } = userAny;
            await ctx.db.replace(userId, userWithoutImage);
          }
        } else {
          console.warn("[Auth] User not found in afterUserCreatedOrUpdated", {
            userId,
            email: args.profile?.email,
          });
        }
      } catch (error) {
        // If userId is invalid, log but don't fail - createOrUpdateUser already handled user creation
        console.error(
          "[Auth] Error in afterUserCreatedOrUpdated (non-fatal):",
          error,
          { userId: args.userId },
        );
      }
    },
  },
});

// Run this once to clean up existing documents that have the 'image' field
export const removeImageFieldFromUsers = mutation({
  handler: async (ctx) => {
    console.log(
      "[Auth Migration] Starting removal of 'image' field from users",
    );
    const users = await ctx.db.query("users").collect();
    let cleanedCount = 0;

    for (const user of users) {
      // Check if user has 'image' field (TypeScript won't know about it, so we use 'as any')
      const userAny = user as any;
      if ("image" in userAny && userAny.image !== undefined) {
        console.log(
          `[Auth Migration] Removing 'image' field from user ${user._id}`,
        );
        // Use replace to remove the field (patch doesn't support field removal)
        const { image, ...userWithoutImage } = userAny;
        await ctx.db.replace(user._id, userWithoutImage);
        cleanedCount++;
      }
    }

    console.log(
      `[Auth Migration] Completed: cleaned ${cleanedCount} user document(s)`,
    );
    return { cleanedCount, totalUsers: users.length };
  },
});
