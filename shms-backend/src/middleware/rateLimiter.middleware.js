import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";

import env from "../config/env.js";
import { errorResponse } from "../utils/apiResponse.js";

/*
 * Rate limiting is keyed so that a clinic where many people share one public
 * IP (campus NAT, a reverse proxy) is not throttled as if it were a single
 * client:
 *   - authenticated API traffic is counted per verified user;
 *   - login attempts are counted per (client IP, account), and only failed
 *     attempts count, which still stops password guessing;
 *   - registration and password-reset requests have their own buckets.
 * Behind a reverse proxy, set TRUST_PROXY so req.ip is the real client IP.
 */

const WINDOW_MS = 15 * 60 * 1000;

const tooMany = (message) => (req, res) =>
  errorResponse(res, message, null, 429);

const clientIp = (req) => ipKeyGenerator(req.ip || "");

/* A verified token identifies the caller; anything else falls back to IP. */
function userOrIpKey(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(header.slice(7), env.JWT_SECRET);
      if (decoded && decoded.userId) return `user:${decoded.userId}`;
    } catch {
      // Invalid/expired tokens are limited by IP like anonymous traffic.
    }
  }
  return `ip:${clientIp(req)}`;
}

const normalise = (value) =>
  typeof value === "string" ? value.trim().toLowerCase().slice(0, 200) : "";

export const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: tooMany("Too many requests. Please try again later."),
});

export const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${clientIp(req)}|${normalise(req.body?.identifier)}`,
  handler: tooMany("Too many failed sign-in attempts. Please try again later."),
});

export const registerLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: env.REGISTER_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `register:${clientIp(req)}`,
  handler: tooMany("Too many registration attempts. Please try again later."),
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `reset:${clientIp(req)}|${normalise(req.body?.email) || normalise(req.body?.token).slice(0, 16)}`,
  handler: tooMany("Too many attempts. Please try again later."),
});
