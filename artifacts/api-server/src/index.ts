import app from "./app";
import { logger } from "./lib/logger";
import { runTenantMigration } from "./lib/tenant-migration";
import { startCronScheduler } from "./lib/call-scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start() {
  try {
    await runTenantMigration();
  } catch (err) {
    logger.error({ err }, "Failed to run tenant migration — continuing anyway");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });

  startCronScheduler();
}

start();
