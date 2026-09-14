import { getRedisClient, isRedisAvailable } from "../config/redis.js";

const PREFIX = "rs:";
const memCounts = new Map();
const memBlocks = new Map();

function memPrune(key, ttlMs) {
  const arr = memCounts.get(key);
  if (!arr) return [];
  const cutoff = Date.now() - ttlMs;
  while (arr.length && arr[0] <= cutoff) arr.shift();
  if (arr.length === 0) memCounts.delete(key);
  return arr;
}

/**
 * Counting/blocking primitive shared by both the Redis and in-memory
 * backends. Redis is authoritative when available; otherwise everything
 * degrades to per-process memory (same behaviour as before Redis).
 */
export const sessionStore = {
  async incr(key, ttlMs) {
    if (isRedisAvailable()) {
      const c = getRedisClient();
      const k = PREFIX + key;
      const total = await c.incr(k);
      if (total === 1) await c.pExpire(k, ttlMs);
      return total;
    }
    const arr = memPrune(key, ttlMs);
    arr.push(Date.now());
    memCounts.set(key, arr);
    return arr.length;
  },

  async count(key, ttlMs) {
    if (isRedisAvailable()) {
      const v = await getRedisClient().get(PREFIX + key);
      return v ? Number.parseInt(v, 10) : 0;
    }
    return memPrune(key, ttlMs).length;
  },

  async clear(key) {
    if (isRedisAvailable()) {
      await getRedisClient().del(PREFIX + key);
      return;
    }
    memCounts.delete(key);
  },

  async block(key, durationMs) {
    const until = Date.now() + durationMs;
    if (isRedisAvailable()) {
      await getRedisClient().set(PREFIX + key, String(until), { PX: durationMs });
      return;
    }
    memBlocks.set(key, until);
  },

  async isBlocked(key) {
    if (isRedisAvailable()) {
      const v = await getRedisClient().get(PREFIX + key);
      return v !== null && Number.parseInt(v, 10) > Date.now();
    }
    const until = memBlocks.get(key);
    return Boolean(until && until > Date.now());
  },
};