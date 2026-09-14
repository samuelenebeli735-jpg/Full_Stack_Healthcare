import { createClient } from "redis";
import env from "./env.js";

let client = null;
let checked = false;
let available = false;

export function getRedisClient() {
  if (!client) {
    client = createClient({
      url: env.REDIS_URL || "redis://127.0.0.1:6379",
      socket: {
        connectTimeout: 1500,
        reconnectStrategy: (retries) => {
          if (retries > 5) return new Error("Redis unavailable.");
          return Math.min(500 * 2 ** retries, 3000);
        },
      },
    });
    client.on("error", () => {
      available = false;
    });
    client.on("ready", () => {
      available = true;
    });
  }
  return client;
}

export function isRedisAvailable() {
  if (!env.REDIS_URL) return false;
  if (!client) return false;
  return available && client.isReady;
}

export async function ensureRedis() {
  if (!env.REDIS_URL) return false;
  if (isRedisAvailable()) return true;
  if (checked) return available;

  try {
    const c = getRedisClient();
    await c.connect();
    await c.ping();
    available = true;
  } catch {
    available = false;
  }
  checked = true;
  return available;
}