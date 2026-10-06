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

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default env;
