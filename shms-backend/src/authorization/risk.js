const WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_LIMIT = 10;
const AUTHZ_DENIAL_LIMIT = 30;
const CROSS_ORG_LIMIT = 30;
const SENSITIVE_MEDIUM_LIMIT = 100;
const SENSITIVE_HIGH_LIMIT = 500;

const counts = new Map();
const blockedUntil = new Map();

const now = () => Date.now();

function prune(key) {
  const arr = counts.get(key);
  if (!arr) return [];
  while (arr.length && arr[0] <= now() - WINDOW_MS) arr.shift();
  return arr;
}

function hit(key) {
  const arr = prune(key);
  arr.push(now());
  counts.set(key, arr);
  return arr.length;
}

function count(key) {
  return prune(key).length;
}

function clear(key) {
  counts.delete(key);
}

function block(key) {
  blockedUntil.set(key, now() + WINDOW_MS);
}

export function isBlocked(userId, ip) {
  const ukey = `user:${userId}`;
  const ikey = `ip:${ip}`;
  return blockedUntil.get(ukey) > now() || blockedUntil.get(ikey) > now();
}

export function recordLoginFailure(identifier, ip) {
  const n = hit(`login:${ip || "unknown"}:${identifier}`);
  return n >= LOGIN_FAIL_LIMIT
    ? "HIGH"
    : n >= Math.ceil(LOGIN_FAIL_LIMIT / 2)
      ? "MEDIUM"
      : "LOW";
}

export function recordLoginSuccess(identifier, ip) {
  clear(`login:${ip || "unknown"}:${identifier}`);
}

export function recordAuthzDenial({ userId }) {
  const n = hit(`authz:user:${userId}`);
  if (n >= AUTHZ_DENIAL_LIMIT * 2) block(`user:${userId}`);
  return n >= AUTHZ_DENIAL_LIMIT
    ? "HIGH"
    : n >= Math.ceil(AUTHZ_DENIAL_LIMIT / 2)
      ? "MEDIUM"
      : "LOW";
}

export function recordCrossOrgAttempt({ userId }) {
  const n = hit(`cross:user:${userId}`);
  if (n >= CROSS_ORG_LIMIT * 2) block(`user:${userId}`);
  return n >= CROSS_ORG_LIMIT
    ? "HIGH"
    : n >= Math.ceil(CROSS_ORG_LIMIT / 2)
      ? "MEDIUM"
      : "LOW";
}

export function recordSensitiveAccess({ userId }) {
  const n = hit(`sens:user:${userId}`);
  return n >= SENSITIVE_HIGH_LIMIT
    ? "HIGH"
    : n >= SENSITIVE_MEDIUM_LIMIT
      ? "MEDIUM"
      : "LOW";
}

export function assessRisk(userId, ip) {
  if (isBlocked(userId, ip)) return "HIGH";
  const sens = count(`sens:user:${userId}`);
  if (count(`authz:user:${userId}`) >= AUTHZ_DENIAL_LIMIT) return "HIGH";
  if (count(`cross:user:${userId}`) >= CROSS_ORG_LIMIT) return "HIGH";
  if (sens >= SENSITIVE_HIGH_LIMIT) return "HIGH";
  if (sens >= SENSITIVE_MEDIUM_LIMIT) return "MEDIUM";
  return "LOW";
}