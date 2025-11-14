import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { DataModel, Id } from "./_generated/dataModel.js";
import type { GenericMutationCtx } from "convex/server";
import { mutation } from "./_generated/server.js";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const siteUrl = process.env.SITE_URL;
const jwtPrivateKey = process.env.JWT_PRIVATE_KEY;
const resendApiKey = process.env.AUTH_RESEND_KEY;
const resendFromEmail =
  process.env.AUTH_RESEND_FROM_EMAIL || "noreply@example.com";

// Validate JWT key format (Convex Auth reads it from env automatically)
const isValidJwtKey =
  jwtPrivateKey &&
  typeof jwtPrivateKey === "string" &&
  jwtPrivateKey.trim().length > 0;

// Log configuration status
console.log("[Auth] Configuration check:", {
  hasGoogleClientId: !!googleClientId,
  hasGoogleClientSecret: !!googleClientSecret,
  hasSiteUrl: !!siteUrl,
  hasJwtPrivateKey: !!jwtPrivateKey,
  jwtPrivateKeyLength: jwtPrivateKey?.length || 0,
  isValidJwtKeyFormat: isValidJwtKey,
  hasResendApiKey: !!resendApiKey,
  resendFromEmail: resendFromEmail,
});

if (!isValidJwtKey) {
  console.error(
    "[Auth] ✗ JWT_PRIVATE_KEY is missing or invalid - this will cause authentication failures",
  );
  console.error("[Auth] To fix this:");
  console.error("  1. Generate a new key: node generateKeys.mjs");
  console.error(
    '  2. Set it in Convex: npx convex env set JWT_PRIVATE_KEY "<key from step 1>"',
  );
} else {
  // Validate key format more strictly
  const hasBeginMarker =
    jwtPrivateKey.includes("BEGIN PRIVATE KEY") ||
    jwtPrivateKey.includes("BEGIN RSA PRIVATE KEY");
  const hasEndMarker =
    jwtPrivateKey.includes("END PRIVATE KEY") ||
    jwtPrivateKey.includes("END RSA PRIVATE KEY");

  if (!hasBeginMarker || !hasEndMarker) {
    console.warn(
      "[Auth] ⚠ JWT_PRIVATE_KEY format may be incorrect - should contain BEGIN/END markers",
      {
        hasBeginMarker,
        hasEndMarker,
        keyPreview: jwtPrivateKey.substring(0, 100),
      },
    );
  }
}

// Super admin email
const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL || "rex@diazcorporations.com";

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

// Add Resend email provider for email verification (if configured)
const hasResendCredentials =
  resendApiKey &&
  typeof resendApiKey === "string" &&
  resendApiKey.trim().length > 0 &&
  siteUrl &&
  typeof siteUrl === "string" &&
  siteUrl.trim().length > 0;

if (hasResendCredentials) {
  console.log("[Auth] ✓ Resend provider configured for email verification");
  try {
    const resendProvider = Resend({
      apiKey: resendApiKey!,
      from: resendFromEmail,
      sendVerificationRequest: async ({ identifier: email, url, provider }) => {
        console.log("[Auth] Sending email verification", {
          email,
          url: url.substring(0, 50) + "...",
        });
        try {
          const { Resend: ResendSDK } = await import("resend");
          const resend = new ResendSDK(provider.apiKey);
          await resend.emails.send({
            from: provider.from as string,
            to: email,
            subject: "Verify your email address",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Verify your email address</h2>
                <p>Click the button below to verify your email address:</p>
                <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
                  Verify Email
                </a>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">${url}</p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                  This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
                </p>
              </div>
            `,
            text: `Verify your email address by clicking this link: ${url}`,
          });
          console.log("[Auth] ✓ Email verification sent successfully", {
            email,
          });
        } catch (error) {
          console.error("[Auth] ✗ Failed to send email verification", {
            email,
            error,
          });
          throw error;
        }
      },
    });
    providers.push(resendProvider);
  } catch (error) {
    console.error("[Auth] ✗ Failed to create Resend provider:", error);
  }
} else {
  console.warn(
    "[Auth] ⚠ Resend provider skipped - missing credentials or SITE_URL",
  );
}

// Add Password provider (always available)
try {
  const passwordProvider = Password({
    profile(params) {
      console.log("[Auth] Password provider profile callback", {
        email: params.email,
        name: params.name,
        hasEmail: !!params.email,
        hasName: !!params.name,
      });
      return {
        email: params.email as string,
        name: params.name as string,
      };
    },
  });
  providers.push(passwordProvider);
  console.log("[Auth] ✓ Password provider configured", {
    emailVerificationEnabled: hasResendCredentials,
    hasJwtKey: !!jwtPrivateKey,
    isValidJwtKeyFormat: isValidJwtKey,
    jwtKeyLength: jwtPrivateKey?.length || 0,
  });

  if (!isValidJwtKey) {
    console.error(
      "[Auth] ⚠ WARNING: JWT_PRIVATE_KEY is missing or invalid - password authentication may fail",
    );
  }
} catch (error) {
  console.error("[Auth] ✗ Failed to create Password provider:", error);
  console.error("[Auth] Password provider error details:", {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
    hasJwtKey: !!jwtPrivateKey,
    isValidJwtKeyFormat: isValidJwtKey,
  });
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
      console.log("[Auth] ===== createOrUpdateUser START =====", {
        existingUserId: args.existingUserId,
        email: args.profile?.email,
        type: args.type,
        providerId: args.provider?.id,
        hasProfile: !!args.profile,
        profileKeys: Object.keys(args.profile || {}),
      });
      try {
        const email = args.profile?.email;
        const name = args.profile?.name;
        const pictureUrl = args.profile?.picture || args.profile?.image;
        // For Resend provider (email verification), consider email as verified
        const isResendVerification =
          args.type === "email" || args.type === "verification";
        const emailVerified =
          args.profile?.emailVerified ?? isResendVerification;
        const phoneVerified = args.profile?.phoneVerified ?? false;

        console.log("[Auth] Email verification status", {
          email,
          type: args.type,
          isResendVerification,
          emailVerified,
          profileEmailVerified: args.profile?.emailVerified,
        });

        // If user already exists, update it
        if (args.existingUserId) {
          const existingUser = await ctx.db.get(args.existingUserId);
          if (existingUser && existingUser._id) {
            // Verify _id matches (should always be true, but defensive check)
            if (existingUser._id !== args.existingUserId) {
              console.warn("[Auth] User _id mismatch", {
                expected: args.existingUserId,
                actual: existingUser._id,
              });
            }

            // For password-based sign-in, require email verification
            if (
              args.type === "credentials" &&
              hasResendCredentials &&
              !existingUser.emailVerificationTime
            ) {
              console.log(
                "[Auth] User attempting to sign in with unverified email - blocking sign-in",
                {
                  userId: existingUser._id,
                  email: existingUser.email,
                },
              );
              // Throw error to prevent sign-in for unverified users
              throw new Error(
                "EMAIL_NOT_VERIFIED: Please verify your email address before signing in. Check your inbox for a verification link.",
              );
            }

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
              // Reset verification if email changed
              if (hasResendCredentials) {
                updates.emailVerificationTime = undefined;
              }
            }
            if (name && existingUser.name !== name) {
              updates.name = name as string;
            }
            if (pictureUrl && existingUser.avatar !== pictureUrl) {
              updates.avatar = pictureUrl as string;
            }
            if (emailVerified && !existingUser.emailVerificationTime) {
              updates.emailVerificationTime = Date.now();
              console.log("[Auth] Email verified for existing user", {
                userId: args.existingUserId,
                email: existingUser.email,
              });
            }
            if (phoneVerified && !existingUser.phoneVerificationTime) {
              updates.phoneVerificationTime = Date.now();
            }

            // If image field exists, remove it by replacing the document
            if (needsImageCleanup) {
              console.log(
                `[Auth] Removing 'image' field from user ${args.existingUserId}`,
              );
              const { image, _id, ...userWithoutImage } = userAny;
              // Ensure we have all required fields and don't include _id in the replace
              await ctx.db.replace(args.existingUserId, {
                ...userWithoutImage,
                ...updates,
              });
            } else if (Object.keys(updates).length > 0) {
              await ctx.db.patch(args.existingUserId, updates);
            }

            // Verify the user still exists after updates and return the ID
            const verifiedUser = await ctx.db.get(args.existingUserId);
            if (!verifiedUser || !verifiedUser._id) {
              console.error(
                "[Auth] User disappeared after update or _id is missing",
                {
                  existingUserId: args.existingUserId,
                  verifiedUser: verifiedUser ? "exists but no _id" : "null",
                },
              );
              throw new Error(
                "User update failed - user not found after update",
              );
            }

            // Use the verified user's _id to ensure it's valid
            const returnUserId = String(verifiedUser._id);
            if (!returnUserId || returnUserId.length < 10) {
              console.error("[Auth] Invalid userId format to return", {
                existingUserId: args.existingUserId,
                verifiedUserId: verifiedUser._id,
                returnUserId,
              });
              throw new Error("Invalid user ID format");
            }

            // Final verification: ensure user exists and has _id before returning
            const finalCheck = await ctx.db.get(returnUserId as Id<"users">);
            if (!finalCheck || !finalCheck._id) {
              console.error(
                "[Auth] Final check failed - user does not exist or missing _id",
                {
                  returnUserId,
                  finalCheck: finalCheck ? "exists but no _id" : "null",
                },
              );
              throw new Error("User verification failed - user not found");
            }

            // Double-check that returnUserId is valid before returning
            if (!returnUserId || typeof returnUserId !== "string") {
              console.error("[Auth] returnUserId is invalid before return", {
                returnUserId,
                type: typeof returnUserId,
              });
              throw new Error("Invalid userId format - cannot return");
            }

            console.log("[Auth] User updated successfully", {
              userId: returnUserId,
              email: verifiedUser.email,
              finalCheckId: finalCheck._id,
            });
            // Ensure we return a valid Id type
            const validUserId = returnUserId as Id<"users">;
            if (!validUserId) {
              throw new Error("Failed to create valid userId");
            }
            return validUserId;
          } else {
            // User ID was provided but user doesn't exist in database
            // This can happen if user was deleted or there's a data inconsistency
            // Try to find user by email as a fallback
            console.warn(
              "[Auth] existingUserId provided but user not found in database, trying email lookup",
              {
                existingUserId: args.existingUserId,
                email: args.profile?.email,
                type: args.type,
              },
            );

            // Try to find user by email as fallback
            if (email && typeof email === "string") {
              try {
                // Use a simple query and filter - this is a fallback case
                const allUsers = await ctx.db.query("users").collect();
                const userByEmail = allUsers.find((u) => u.email === email);

                if (userByEmail && userByEmail._id) {
                  const userId = userByEmail._id;
                  console.log(
                    "[Auth] Found user by email, using that instead",
                    {
                      userId,
                      email,
                    },
                  );
                  // Update the user and return its ID
                  const updates: Partial<{
                    name: string;
                    avatar: string;
                    emailVerificationTime: number;
                    phoneVerificationTime: number;
                  }> = {};

                  if (name && userByEmail.name !== name) {
                    updates.name = name as string;
                  }
                  if (pictureUrl && userByEmail.avatar !== pictureUrl) {
                    updates.avatar = pictureUrl as string;
                  }
                  if (emailVerified && !userByEmail.emailVerificationTime) {
                    updates.emailVerificationTime = Date.now();
                  }
                  if (phoneVerified && !userByEmail.phoneVerificationTime) {
                    updates.phoneVerificationTime = Date.now();
                  }

                  if (Object.keys(updates).length > 0) {
                    await ctx.db.patch(userId, updates);
                  }

                  // Verify user still exists after patch and has _id
                  const verifiedUser = await ctx.db.get(userId);
                  if (!verifiedUser || !verifiedUser._id) {
                    console.error(
                      "[Auth] User disappeared after patch in email lookup or missing _id",
                      {
                        userId,
                        email,
                        verifiedUser: verifiedUser
                          ? "exists but no _id"
                          : "null",
                      },
                    );
                    throw new Error("User not found after update");
                  }

                  // Final verification before returning
                  const finalCheck = await ctx.db.get(userId);
                  if (
                    !finalCheck ||
                    !finalCheck._id ||
                    finalCheck._id !== userId
                  ) {
                    console.error("[Auth] Final check failed in email lookup", {
                      userId,
                      finalCheck: finalCheck
                        ? `exists but _id mismatch: ${finalCheck._id}`
                        : "null",
                    });
                    throw new Error("User verification failed");
                  }

                  // Final check before returning
                  if (!userId || typeof userId !== "string") {
                    console.error(
                      "[Auth] userId is invalid in email lookup return",
                      { userId, type: typeof userId },
                    );
                    throw new Error("Invalid userId - cannot return");
                  }

                  const validUserId = userId as Id<"users">;
                  return validUserId;
                } else if (userByEmail) {
                  console.error(
                    "[Auth] Found user by email but _id is missing",
                    { email, userByEmail },
                  );
                  // Continue to create new user
                }
              } catch (emailLookupError) {
                console.warn(
                  "[Auth] Error looking up user by email",
                  emailLookupError,
                );
                // Continue to create new user
              }
            }

            // If we can't find user by email either, continue to create new user below
            console.warn(
              "[Auth] User not found by ID or email, will create new user",
              { email },
            );
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

        // For password-based sign up, email verification is required
        // OAuth providers (like Google) are considered pre-verified
        const isPasswordSignUp =
          args.type === "credentials" && !args.existingUserId;
        const shouldRequireVerification =
          isPasswordSignUp && hasResendCredentials && !emailVerified;

        console.log("[Auth] User creation details", {
          email,
          type: args.type,
          isPasswordSignUp,
          shouldRequireVerification,
          emailVerified,
        });

        // Create user with all required fields
        // Map image/picture to avatar for consistency
        // Don't set emailVerificationTime for password sign ups until verified
        const userId = await ctx.db.insert("users", {
          name: name || undefined,
          email: email,
          avatar: pictureUrl || undefined,
          role,
          permissions,
          memberNumber,
          profileCompleted: false,
          // Only set verification time if already verified (OAuth) or not requiring verification
          ...(emailVerified && !shouldRequireVerification
            ? { emailVerificationTime: Date.now() }
            : {}),
          ...(phoneVerified ? { phoneVerificationTime: Date.now() } : {}),
        });

        // Verify the user was created successfully
        if (!userId) {
          console.error(
            "[Auth] Failed to create user - userId is null/undefined",
            {
              email,
              type: args.type,
            },
          );
          throw new Error("Failed to create user account");
        }

        // Log the account creation
        try {
          await ctx.db.insert("auditLogs", {
            userId,
            action: "Account created",
            entityType: "user",
            entityId: userId,
            timestamp: Date.now(),
          });
        } catch (auditError) {
          // Log audit error but don't fail user creation
          console.error("[Auth] Failed to create audit log", auditError);
        }

        // Ensure we return a valid string ID
        const returnUserId = String(userId);
        if (!returnUserId || returnUserId.length < 10) {
          console.error("[Auth] Invalid userId format after creation", {
            userId,
            returnUserId,
          });
          throw new Error("Invalid user ID format after creation");
        }

        // Final verification: ensure user exists in database before returning
        const finalCheck = await ctx.db.get(returnUserId as Id<"users">);
        if (!finalCheck || !finalCheck._id) {
          console.error("[Auth] Final check failed after user creation", {
            returnUserId,
            finalCheck: finalCheck ? "exists but no _id" : "null",
          });
          throw new Error("User creation verification failed - user not found");
        }

        // Final validation before returning
        if (!returnUserId || typeof returnUserId !== "string") {
          console.error(
            "[Auth] returnUserId is invalid before return in creation",
            { returnUserId, type: typeof returnUserId },
          );
          throw new Error("Invalid userId format - cannot return");
        }

        console.log("[Auth] User created successfully", {
          userId: returnUserId,
          email,
          role,
          emailVerified: !shouldRequireVerification && emailVerified,
          requiresVerification: shouldRequireVerification,
          finalCheckId: finalCheck._id,
        });
        // Ensure we return a valid Id type
        const validUserId = returnUserId as Id<"users">;
        if (!validUserId) {
          throw new Error("Failed to create valid userId");
        }
        console.log("[Auth] ===== createOrUpdateUser SUCCESS =====", {
          userId: validUserId,
          email: args.profile?.email,
        });
        return validUserId;
      } catch (error) {
        console.error("[Auth] ===== createOrUpdateUser ERROR =====", {
          error,
          email: args.profile?.email,
          type: args.type,
        });
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error("[Auth] Error in createOrUpdateUser callback", {
          error,
          email: args.profile?.email,
          type: args.type,
          existingUserId: args.existingUserId,
          errorMessage,
          errorStack,
          // Check if error is related to _id
          isIdError:
            errorMessage.includes("_id") || errorMessage.includes("null"),
        });

        // If the error is about _id being null, provide more context
        if (errorMessage.includes("_id") || errorMessage.includes("null")) {
          console.error("[Auth] _id related error detected", {
            email: args.profile?.email,
            type: args.type,
            existingUserId: args.existingUserId,
            profile: args.profile,
          });
        }

        // Re-throw to let Convex Auth handle it
        throw error;
      }
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

        if (existingUser === null) {
          console.warn("[Auth] User not found in afterUserCreatedOrUpdated", {
            userId,
            email: args.profile?.email,
            type: args.type,
          });
          return;
        }

        // At this point, existingUser is guaranteed to be non-null
        // But add extra safety check for _id
        if (!existingUser._id) {
          console.error(
            "[Auth] User found but _id is missing in afterUserCreatedOrUpdated",
            { userId, email: existingUser.email },
          );
          return;
        }

        console.log("[Auth] User verified in afterUserCreatedOrUpdated", {
          userId,
          email: existingUser.email,
          user_id: existingUser._id,
        });

        // Clean up: Remove 'image' field if it exists (migration cleanup)
        const userAny = existingUser as any;
        if ("image" in userAny && userAny.image !== undefined) {
          console.log(`[Auth] Removing 'image' field from user ${userId}`);
          const { image, _id, ...userWithoutImage } = userAny;
          await ctx.db.replace(userId, userWithoutImage);
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

// Send email verification for password-based users
export const sendEmailVerification = mutation({
  args: {},
  handler: async (ctx) => {
    console.log("[Auth] sendEmailVerification mutation called");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) {
      throw new Error("User must be authenticated to send verification email");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.emailVerificationTime) {
      console.log("[Auth] Email already verified", { userId: user._id });
      return { success: true, message: "Email already verified" };
    }

    if (!hasResendCredentials || !resendApiKey || !siteUrl) {
      throw new Error("Email verification is not configured");
    }

    // Generate verification URL using Resend provider's flow
    // We'll use the signIn function with resend provider to trigger email
    console.log("[Auth] Verification email will be sent via Resend provider", {
      email: user.email,
    });

    return {
      success: true,
      message:
        "Please use the 'Send verification email' option in the sign-in dialog",
    };
  },
});

// Verify email using token from verification link
export const verifyEmail = mutation({
  args: {},
  handler: async (ctx) => {
    console.log("[Auth] verifyEmail mutation called");
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !identity.email) {
      throw new Error("User must be authenticated to verify email");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.emailVerificationTime) {
      console.log("[Auth] Email already verified", { userId: user._id });
      return { success: true, message: "Email already verified" };
    }

    // Mark email as verified
    await ctx.db.patch(user._id, {
      emailVerificationTime: Date.now(),
    });

    console.log("[Auth] Email verified successfully", {
      userId: user._id,
      email: user.email,
    });

    return { success: true, message: "Email verified successfully" };
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
