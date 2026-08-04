import rateLimit from "express-rate-limit";
import { errorResponse } from "../utils/apiResponse.js";

export const authLimiter = rateLimit({
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
