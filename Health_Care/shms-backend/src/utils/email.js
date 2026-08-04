import env from "../config/env.js";
import logger from "./logger.js";

const webhookUrl = env.EMAIL_WEBHOOK_URL;

/**
 * Send an email through the configured provider.
 *
 * Delivery is abstracted so the backend never depends on a specific email
 * vendor. When `EMAIL_WEBHOOK_URL` is set, the message is POSTed to that
 * endpoint (e.g. a Mailgun/SendGrid-style webhook or a mail gateway).
 * Otherwise the message is logged at `info` level so the flow remains
 * testable in development. Password-reset tokens must only ever be included
 * in the delivery payload, never in API responses.
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

  logger.info(`[EMAIL] To: ${to} | Subject: ${subject} | Body: ${text}`);
}

/**
 * Send a password-reset email containing the reset link.
 */
export async function sendPasswordResetEmail(user, rawToken) {
  const resetUrl = `${env.FRONTEND_URL}reset-password.html?token=${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: "Reset your SHMS password",
    text: `Use the link below to reset your password. The link is valid for 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
    html: `<p>Use the link below to reset your password. The link is valid for 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}
