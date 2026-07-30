import { db } from "@workspace/db";
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSettings, isInQuietWindow } from "../routes/health-assessment";
import { triggerOutboundCall } from "../routes/jessica";
import { logger } from "./logger";

const CHECK_INTERVAL_MS = 60_000;
const LAST_TRIGGERED_KEY = "daily_call_last_triggered_date";

function currentPacificParts(): { hhmm: string; date: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return { hhmm: `${parts["hour"]}:${parts["minute"]}`, date: `${parts["year"]}-${parts["month"]}-${parts["day"]}` };
}

async function getLastTriggeredDate(): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, LAST_TRIGGERED_KEY));
  return rows[0]?.value ?? null;
}

async function setLastTriggeredDate(date: string): Promise<void> {
  const existing = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, LAST_TRIGGERED_KEY));
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value: date, updatedAt: new Date() }).where(eq(appSettingsTable.key, LAST_TRIGGERED_KEY));
  } else {
    await db.insert(appSettingsTable).values({ key: LAST_TRIGGERED_KEY, value: date });
  }
}

async function tick(): Promise<void> {
  const settings = await getSettings();
  if (!settings.dailyCallEnabled) return;

  const { hhmm, date } = currentPacificParts();
  if (hhmm !== settings.dailyCallTime) return;
  if (isInQuietWindow(hhmm, settings.quietWindowStart, settings.quietWindowEnd)) return;

  const lastTriggered = await getLastTriggeredDate();
  if (lastTriggered === date) return;

  // Claim the day before the (slow, external) call starts, so a second tick
  // landing inside the same 60s window can't double-fire the call.
  await setLastTriggeredDate(date);

  logger.info({ time: hhmm, date }, "Triggering scheduled daily Jessica call");
  const result = await triggerOutboundCall();
  if (!result.ok) {
    logger.error({ result }, "Scheduled daily Jessica call failed to start");
  }
}

/** Starts the in-process daily-call scheduler. Call once at server startup. */
export function startDailyCallScheduler(): void {
  setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Daily call scheduler tick threw"));
  }, CHECK_INTERVAL_MS);
  logger.info("Daily call scheduler started");
}
