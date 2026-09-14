import { ensureRedis, getRedisClient, isRedisAvailable } from "../config/redis.js";

/**
 * express-rate-limit v8 custom store backed by Redis. When Redis is
 * unavailable the middleware falls back to the default per-process
 * MemoryStore, so a Redis outage degrades (not breaks) rate limiting.
 *
 * express-rate-limit requires a distinct store instance (with a unique
 * prefix) for every limiter — do not share instances.
 */
export class RedisRateLimitStore {
  constructor(prefix = "rl:") {
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const c = getRedisClient();
    const k = this.prefix + key;
    const totalHits = await c.incr(k);
    if (totalHits === 1) {
      await c.pExpire(k, this.windowMs);
    }
    return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
  }

  async decrement(key) {
    if (!isRedisAvailable()) return;
    await getRedisClient().decr(this.prefix + key);
  }

  async resetKey(key) {
    if (!isRedisAvailable()) return;
    await getRedisClient().del(this.prefix + key);
  }
}

export async function isRedisStoreReady() {
  const ok = await ensureRedis();
  if (!ok) return false;
  try {
    await getRedisClient().ping();
    return true;
  } catch {
    return false;
  }
}