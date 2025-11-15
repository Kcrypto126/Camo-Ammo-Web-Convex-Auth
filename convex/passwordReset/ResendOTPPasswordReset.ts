import { Email } from "@convex-dev/auth/providers/Email";
import { alphabet, generateRandomString } from "oslo/crypto";
import { Resend as ResendAPI } from "resend";
import { render } from "@react-email/render";
import { PasswordResetEmail } from "./PasswordResetEmail";

export const ResendOTPPasswordReset = Email({
  id: "resend-otp-password-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    return generateRandomString(4, alphabet("0-9"));
  },
  async sendVerificationRequest({
    identifier: email,
    provider,
    token,
    expires,
  }) {
    const resend = new ResendAPI(provider.apiKey);
    // Render React component to HTML string to avoid browser API dependencies
    const html = await render(PasswordResetEmail({ code: token, expires }));
    const { error } = await resend.emails.send({
      // TODO: Update with your app name and email address
      from: process.env.AUTH_EMAIL ?? "Camo & Ammo <onboarding@camo.com>",
      to: [email],
      // TODO: Update with your app name
      subject: `Reset password in Camo & Ammo`,
      html,
    });

    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
