import { INVALID_PASSWORD } from "./errors.js";
import Google from "@auth/core/providers/google";
import Resend from "@auth/core/providers/resend";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";
import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTP } from "./otp/ResendOTP";
import { ResendOTPPasswordReset } from "./passwordReset/ResendOTPPasswordReset";
import type { DataModel } from "./_generated/dataModel.js";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google,
    Resend({
      from: process.env.AUTH_EMAIL ?? "My App <onboarding@resend.dev>",
    }),
    Password,
    // Sample password auth with a custom parameter provided during sign-up
    // flow and custom password validation requirements (at least six chars
    // with at least one number, upper and lower case chars).
    Password<DataModel>({
      id: "password-custom",
      profile(params, _ctx) {
        return {
          email: params.email as string,
          favoriteColor: params.favoriteColor as string,
        };
      },
      validatePasswordRequirements: (password: string) => {
        if (
          !password ||
          password.length < 6 ||
          !/\d/.test(password) ||
          !/[a-z]/.test(password) ||
          !/[A-Z]/.test(password)
        ) {
          throw new ConvexError(INVALID_PASSWORD);
        }
      },
    }),
    Password({ id: "password-with-reset", reset: ResendOTPPasswordReset }),
    Password({
      id: "password-code",
      reset: ResendOTPPasswordReset,
      verify: ResendOTP,
    }),
    // This one only makes sense with routing, ignore for now:
    Password({ id: "password-link", verify: Resend }),
  ],
});
