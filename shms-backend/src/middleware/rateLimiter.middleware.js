import rateLimit from "express-rate-limit";
import { errorResponse } from "../utils/apiResponse.js";
import { isRedisStoreReady, RedisRateLimitStore } from "../utils/rateLimitStore.js";

const redisReady = await isRedisStoreReady();

export const authLimiter = rateLimit({
  store: redisReady ? new RedisRateLimitStore("rl:auth:") : undefined,
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    errorResponse(
      res,
      "Too many attempts. Please try again later.",
      null,
      429
    );
  },
});

export const apiLimiter = rateLimit({
  store: redisReady ? new RedisRateLimitStore("rl:api:") : undefined,
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    errorResponse(
      res,
      "Too many requests. Please try again later.",
      null,
      429
    );
  },
});

export const passwordResetLimiter = rateLimit({
  store: redisReady ? new RedisRateLimitStore("rl:reset:") : undefined,
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    errorResponse(
      res,
      "Too many attempts. Please try again later.",
      null,
      429
    );
  },
});