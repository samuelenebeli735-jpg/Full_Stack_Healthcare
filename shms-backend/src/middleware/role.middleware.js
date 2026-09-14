import AppError from "../utils/AppError.js";
import { recordAuthzDenial } from "../authorization/risk.js";

/**
 * Restrict access to specific roles.
 *
 * Usage:
 * authorize("admin")
 * authorize("student", "staff")
 */
const authorize = (...roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError("Authentication required.", 401)
      );
    }

    if (!roles.includes(req.user.role)) {
      try {
        await recordAuthzDenial({ userId: req.user.id });
      } catch {
        // never let risk accounting break authorization
      }
      return next(
        new AppError(
          "You do not have permission to perform this action.",
          403
        )
      );
    }

    next();
  };
};

export default authorize;