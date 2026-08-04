import winston from "winston";
import env from "../config/env.js";

const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "http" : "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "shms-api" },
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV !== "production"
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(
                ({ timestamp, level, message, stack, ...meta }) => {
                  const metaStr = Object.keys(meta).length > 1
                    ? ` ${JSON.stringify(meta)}`
                    : "";
                  return stack
                    ? `${timestamp} [${level}]: ${message}\n${stack}`
                    : `${timestamp} [${level}]: ${message}${metaStr}`;
                }
              )
            )
          : winston.format.json(),
    }),
  ],
});

export default logger;
