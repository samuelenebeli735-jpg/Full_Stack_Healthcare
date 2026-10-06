import app from "./app.js";
import env from "./config/env.js";
import logger from "./utils/logger.js";
import prisma from "./config/db.js";

const PORT = env.PORT;
const HOST = env.HOST;

const server = app.listen(PORT, HOST, () => {
  logger.info(
    `Server running — Environment: ${env.NODE_ENV}, Port: ${PORT}, Host: ${HOST}`
  );
});

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Prisma disconnected. Exiting.");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
