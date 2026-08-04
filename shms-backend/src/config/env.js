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
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",

  DATABASE_URL: process.env.DATABASE_URL,

  CORS_ORIGINS: process.env.CORS_ORIGINS || "",

  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5500",
  EMAIL_WEBHOOK_URL: process.env.EMAIL_WEBHOOK_URL || "",
};

export default env;
