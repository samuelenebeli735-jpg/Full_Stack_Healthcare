import jwt from "jsonwebtoken";

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
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN,
    }
  );
}