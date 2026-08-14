import app from "./app";
import { logger } from "./lib/logger";
import { runTenantMigration } from "./lib/tenant-migration";
import { startCronScheduler, runJobByName } from "./lib/call-scheduler";
import { syncJessicaToolsToElevenLabs } from "./lib/elevenlabs-tools-sync";

const rawPort = process.env["PORT"] ?? process.env["API_PORT"] ?? "8080";

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

  // Best-effort: register Jessica's voice tools with ElevenLabs so they're
  // available on the next call. Never blocks startup and never throws —
  // if ElevenLabs isn't configured yet, this just logs and no-ops; Ray can
  // re-run it anytime from Settings once it is.
  syncJessicaToolsToElevenLabs()
    .then((result) => {
      if (result.ok) {
        logger.info({ tools: result.tools }, "[JessicaTools] Synced voice tools with ElevenLabs at startup");
      } else {
        logger.info({ reason: result.reason, message: result.message }, "[JessicaTools] Skipped syncing voice tools at startup");
      }
    })
    .catch((err) => {
      logger.warn({ err }, "[JessicaTools] Unexpected error syncing voice tools at startup");
    });

  // Best-effort: validate ElevenLabs agent + phone number config at startup so
  // any drift (deleted/renamed agent, removed phone number) surfaces as a
  // dashboard banner right away rather than being discovered when the next
  // scheduled call fails. The daily cron job repeats this check each morning;
  // the forced=true here bypasses the once-per-day claim so it always runs.
  runJobByName("elevenlabs_config_check")
    .then((result) => {
      if (result?.outcome === "warn") {
        logger.warn({ detail: result.detail }, "[ElevenLabs] Config validation issue at startup — check dashboard alerts");
      }
    })
    .catch(() => {});
  // not awaited — startup proceeds regardless
}

start();
