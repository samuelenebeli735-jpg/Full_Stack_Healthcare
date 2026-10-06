import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import routes from "./routes/index.js";
import errorMiddleware from "./middleware/error.middleware.js";
import notFoundMiddleware from "./middleware/notfound.middleware.js";
import { apiLimiter } from "./middleware/rateLimiter.middleware.js";

import { API_PREFIX, APP_NAME, APP_VERSION } from "./config/constants.js";
import env from "./config/env.js";
import logger from "./utils/logger.js";

const app = express();

/*
 * Behind a reverse proxy (nginx, a load balancer, Docker ingress) every
 * request arrives from the proxy's address. TRUST_PROXY tells Express how
 * many proxy hops to trust so req.ip (used for rate limiting and audit) is
 * the real client. Values: "true", a hop count such as "1", or an
 * address/subnet list ("loopback", "10.0.0.0/8"). Unset = direct clients.
 */
if (env.TRUST_PROXY) {
  const value = env.TRUST_PROXY;
  app.set(
    "trust proxy",
    value === "true" ? true : /^\d+$/.test(value) ? Number(value) : value
  );
}

/*
|--------------------------------------------------------------------------
| Global Middleware
|--------------------------------------------------------------------------
*/

const defaultOrigins = [
  env.FRONTEND_URL,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
].filter(Boolean);

const allowedOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : defaultOrigins;

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

app.use(compression());

const requestLogStream = {
  write: (message) => logger.http(message.trim()),
};

app.use(
  morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: requestLogStream,
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Sign-in, registration and password-reset routes carry their own limiters
// (see routes/auth.route.js); everything else is limited per user/IP here.
app.use(apiLimiter);

/*
|--------------------------------------------------------------------------
| Root Route
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    application: APP_NAME,
    version: APP_VERSION,
    message: "SHMS Backend is running.",
  });
});

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get(`${API_PREFIX}/health`, (req, res) => {
  res.status(200).json({
    success: true,
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use(API_PREFIX, routes);

app.use(notFoundMiddleware);

app.use(errorMiddleware);

export default app;
