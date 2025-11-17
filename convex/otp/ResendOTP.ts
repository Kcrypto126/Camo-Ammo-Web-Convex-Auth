import { Email } from "@convex-dev/auth/providers/Email";
import { alphabet, generateRandomString } from "oslo/crypto";
import { Resend as ResendAPI } from "resend";
import { render } from "@react-email/render";
import { VerificationCodeEmail } from "./VerificationCodeEmail";

export const ResendOTP = Email({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  maxAge: 60 * 20,
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
    const html = await render(VerificationCodeEmail({ code: token, expires }));
    const { error } = await resend.emails.send({
      // TODO: Update with your app name and email address
      from: process.env.AUTH_EMAIL ?? "Camo & Ammo <no-reply@sbinfotech.us>",
      to: [email],
      // TODO: Update with your app name
      subject: `Sign in to Camo & Ammo`,
      html,
    });

    if (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
