import app from "./app.js";
import env from "./config/env.js";
import logger from "./utils/logger.js";
import prisma from "./config/db.js";
import { closeOutPastQueueDaysEverywhere } from "./services/queue.service.js";

const PORT = env.PORT;
const HOST = env.HOST;

const server = app.listen(PORT, HOST, () => {
  logger.info(
    `Server running — Environment: ${env.NODE_ENV}, Port: ${PORT}, Host: ${HOST}, ` +
      `Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone} (clinic wall-clock)`
  );
});

// Day-close policy (F14): close queue tickets left waiting/called on earlier
// days (patients not seen -> no-show). The queue endpoints also do this on
// use; the sweep keeps dashboards and reports right when nobody opens them.
const DAY_CLOSE_INTERVAL_MS = 10 * 60 * 1000;
async function runDayClose() {
  try {
    const closed = await closeOutPastQueueDaysEverywhere();
    if (closed) logger.info(`Day close: ${closed} unseen queue ticket(s) from earlier days marked no-show.`);
  } catch (error) {
    logger.error(`Day-close sweep failed: ${error.message}`);
  }
}
setTimeout(runDayClose, 5000).unref();
setInterval(runDayClose, DAY_CLOSE_INTERVAL_MS).unref();

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
