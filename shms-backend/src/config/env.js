import dotenv from "dotenv";

dotenv.config();

const REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET"];

const missing = REQUIRED_VARS.filter(
  (key) => !process.env[key] || process.env[key].trim() === ""
);

if (missing.length > 0) {
  console.error(
    `FATAL: Missing required environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

const env = {
  PORT: Number.parseInt(process.env.PORT, 10) || 5000,
  // Interface to listen on. Loopback by default so a local run is not exposed
  // to the network; containers set HOST=0.0.0.0 so the port mapping works.
  HOST: (process.env.HOST || "").trim() || "127.0.0.1",
  NODE_ENV: process.env.NODE_ENV || "development",

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || "").trim() || "1h",

  DATABASE_URL: process.env.DATABASE_URL,

  CORS_ORIGINS: process.env.CORS_ORIGINS || "",

  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5500",
  EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL || "",

  // Express "trust proxy" setting; leave empty when clients connect directly.
  // Behind one reverse proxy use "1" (or "loopback", a subnet, etc.).
  TRUST_PROXY: (process.env.TRUST_PROXY || "").trim(),

  // Requests per 15 minutes per signed-in user (anonymous traffic: per IP).
  API_RATE_LIMIT_MAX: positiveInt(process.env.API_RATE_LIMIT_MAX, 600),
  // Failed sign-in attempts per 15 minutes per (client IP, account).
  LOGIN_RATE_LIMIT_MAX: positiveInt(process.env.LOGIN_RATE_LIMIT_MAX, 10),
  // Registrations per 15 minutes per client IP.
  REGISTER_RATE_LIMIT_MAX: positiveInt(process.env.REGISTER_RATE_LIMIT_MAX, 30),
};

/*
 * Production safety: refuse to start with a JWT secret that can be guessed
 * (anyone could forge an admin token), and warn about settings still left at
 * development defaults.
 */
if (env.NODE_ENV === "production") {
  const secret = String(env.JWT_SECRET);
  if (secret.length < 32 || /your_jwt_secret_here|change[_-]?me|^secret$/i.test(secret)) {
    console.error("FATAL: JWT_SECRET is too weak for production (use at least 32 random characters).");
    process.exit(1);
  }
  const warn = (msg) => console.warn(`WARNING (production config): ${msg}`);
  if (!process.env.FRONTEND_URL || /localhost|127.0.0.1/.test(env.FRONTEND_URL)) {
    warn("FRONTEND_URL is not set to the public site address; password-reset links will point to it.");
  }
  if (!env.CORS_ORIGINS) warn("CORS_ORIGINS is not set; only development origins are allowed for cross-origin calls.");
  if (!env.EMAIL_WEBHOOK_URL) warn("EMAIL_WEBHOOK_URL is not set; password reset by email is unavailable.");
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default env;
