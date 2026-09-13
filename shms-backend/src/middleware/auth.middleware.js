import jwt from "jsonwebtoken";

import AppError from "../utils/AppError.js";
import env from "../config/env.js";
import { withTenant } from "../utils/tenantContext.js";

import { findUserWithProfileById } from "../repositories/user.repository.js";

/**
 * Authenticate user using JWT.
 */
const authenticate = async (req, res, next) => {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError("Authorization header is missing.", 401);
    }

    // Check Bearer token format
    if (!authHeader.startsWith("Bearer ")) {
      throw new AppError("Invalid authorization format.", 401);
    }

    // Extract token
    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      env.JWT_SECRET
    );

    // Find user within their organization's tenant context. If the token's
    // organization claim does not match the user's real organization, RLS
    // hides the row and the request is rejected (fail closed).
    if (!decoded.organizationId) {
      throw new AppError("Invalid authorization token.", 401);
    }

    const user = await withTenant(decoded.organizationId, (tx) =>
      findUserWithProfileById(decoded.userId, tx)
    );

    if (!user) {
      throw new AppError("User not found.", 401);
    }

    if (!user.isActive) {
      throw new AppError("Account has been deactivated.", 403);
    }

    // Attach authenticated user to request
    req.user = user;

    next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return next(
        new AppError("Invalid or expired token.", 401)
      );
    }

    next(error);
  }
};

export default authenticate;