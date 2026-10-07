import env from "../config/env.js";
import logger from "./logger.js";

const webhookUrl = env.EMAIL_WEBHOOK_URL;

/**
 * Send an email through the configured provider.
 *
 * Delivery is abstracted so the backend never depends on a specific email
 * vendor. When `EMAIL_WEBHOOK_URL` is set, the message is POSTed to that
 * endpoint (e.g. a Mailgun/SendGrid-style webhook or a mail gateway).
 * Otherwise nothing is sent and only the subject is logged: the body can
 * carry a password-reset link, which must never reach logs or API responses.
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!to) return;

  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, text, html }),
      });

      if (!res.ok) {
        logger.error(`Email delivery failed with status ${res.status} for ${to}.`);
      }
    } catch (err) {
      logger.error(`Email delivery failed for ${to}: ${err.message}`);
    }
    return;
  }

  logger.warn(`[EMAIL] Not delivered, EMAIL_WEBHOOK_URL is not configured. Subject: ${subject}`);
}

/**
 * True when an email provider is configured, i.e. emails are actually sent.
 */
export function isEmailDeliveryConfigured() {
  return Boolean(webhookUrl);
}

/**
 * Send a password-reset email containing the reset link.
 */
export async function sendPasswordResetEmail(user, rawToken) {
  // Join as URLs: FRONTEND_URL is normally configured without a trailing
  // slash (https://clinic.example.org), and plain concatenation produced a
  // broken link (https://clinic.example.orgreset-password.html).
  const base = env.FRONTEND_URL.endsWith("/") ? env.FRONTEND_URL : `${env.FRONTEND_URL}/`;
  const link = new URL("reset-password.html", base);
  link.searchParams.set("token", rawToken);
  const resetUrl = link.toString();

  await sendEmail({
    to: user.email,
    subject: "Reset your SHMS password",
    text: `Use the link below to reset your password. The link is valid for 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Use the link below to reset your password. The link is valid for 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}
