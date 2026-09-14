import { sessionStore } from "../utils/sessionStore.js";

const WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_LIMIT = 10;
const AUTHZ_DENIAL_LIMIT = 30;
const CROSS_ORG_LIMIT = 30;
const SENSITIVE_MEDIUM_LIMIT = 100;
const SENSITIVE_HIGH_LIMIT = 500;

const now = () => Date.now();

const level = (n, limit) =>
  n >= limit ? "HIGH" : n >= Math.ceil(limit / 2) ? "MEDIUM" : "LOW";

export async function isBlocked(userId, ip) {
  const ukey = `user:${userId}`;
  const ikey = `ip:${ip}`;
  return (
    (await sessionStore.isBlocked(ukey)) || (await sessionStore.isBlocked(ikey))
  );
}

export async function recordLoginFailure(identifier, ip) {
  const n = await sessionStore.incr(`login:${ip || "unknown"}:${identifier}`, WINDOW_MS);
  return level(n, LOGIN_FAIL_LIMIT);
}

export async function recordLoginSuccess(identifier, ip) {
  await sessionStore.clear(`login:${ip || "unknown"}:${identifier}`);
}

export async function recordAuthzDenial({ userId }) {
  const n = await sessionStore.incr(`authz:${userId}`, WINDOW_MS);
  if (n >= AUTHZ_DENIAL_LIMIT * 2) {
    await sessionStore.block(`user:${userId}`, WINDOW_MS);
  }
  return level(n, AUTHZ_DENIAL_LIMIT);
}

export async function recordCrossOrgAttempt({ userId }) {
  const n = await sessionStore.incr(`cross:${userId}`, WINDOW_MS);
  if (n >= CROSS_ORG_LIMIT * 2) {
    await sessionStore.block(`user:${userId}`, WINDOW_MS);
  }
  return level(n, CROSS_ORG_LIMIT);
}

export async function recordSensitiveAccess({ userId }) {
  const n = await sessionStore.incr(`sens:${userId}`, WINDOW_MS);
  return level(n, SENSITIVE_HIGH_LIMIT);
}

export async function assessRisk(userId, ip) {
  if (await isBlocked(userId, ip)) return "HIGH";
  const sens = await sessionStore.count(`sens:${userId}`, WINDOW_MS);
  if ((await sessionStore.count(`authz:${userId}`, WINDOW_MS)) >= AUTHZ_DENIAL_LIMIT) return "HIGH";
  if ((await sessionStore.count(`cross:${userId}`, WINDOW_MS)) >= CROSS_ORG_LIMIT) return "HIGH";
  if (sens >= SENSITIVE_HIGH_LIMIT) return "HIGH";
  if (sens >= SENSITIVE_MEDIUM_LIMIT) return "MEDIUM";
  return "LOW";
}