import AppError from "../utils/AppError.js";

/**
 * Restrict access to specific roles.
 *
 * Usage:
 * authorize("admin")
 * authorize("student", "staff")
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError("Authentication required.", 401)
      );
    }

    if (!roles.includes(req.user.role)) {
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