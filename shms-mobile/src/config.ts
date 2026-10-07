/**
 * Base URL of the SHMS API, including the /api/v1 prefix.
 * Set EXPO_PUBLIC_API_URL in .env.local (git-ignored), e.g.
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:5000/api/v1
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** The clinic's wall clock: SHMS runs on Africa/Lagos time (UTC+1, no DST). */
export const CLINIC_UTC_OFFSET_MINUTES = 60;
