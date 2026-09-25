import jwt from "jsonwebtoken";

import env from "../config/env.js";

/**
 * Generate a JWT for an authenticated user.
 *
 * @param {Object} user
 * @returns {string}
 */
export default function generateToken({ userId, organizationId, role }) {
  return jwt.sign(
    {
      userId,
      organizationId,
      role,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
    }
  );
}