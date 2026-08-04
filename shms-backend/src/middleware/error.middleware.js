import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { errorResponse } from "../utils/apiResponse.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import env from "../config/env.js";

const errorMiddleware = (err, req, res, next) => {
  logger.error(err.message, {
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ...(err instanceof AppError ? { statusCode: err.statusCode } : {}),
  });

  // Default values
  let statusCode = 500;
  let message = "Internal Server Error";

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "A record with this value already exists.";
        break;

      case "P2025":
        statusCode = 404;
        message = "Requested record was not found.";
        break;

      case "P2003":
        statusCode = 409;
        message = "This record cannot be deleted because it is still in use.";
        break;

      default:
        statusCode = 500;
        message = "Database operation failed.";
    }
  }

  // Zod validation errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed.";

    err.errors = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
  }

  // Custom application errors
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Other unexpected errors
  else {
    statusCode = err.statusCode || 500;
    message =
      env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message || "Internal Server Error";
  }

  return errorResponse(
    res,
    message,
    err.errors || null,
    statusCode
  );
};

export default errorMiddleware;