/**
 * Support helpers for Jessica's real-time voice tool-calling (Task #116).
 *
 * These back the ElevenLabs webhook tools wired up in routes/jessica.ts and
 * lib/elevenlabs-tools-sync.ts: add/remove/reschedule a schedule_tasks row,
 * or flip the daily-call schedule, entirely from a live phone call.
 */
import { db } from "@workspace/db";
import { scheduleTasksTable, appSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "crypto";

export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

/**
 * Same hour boundaries as computeQuarterForHour() in lib/call-scheduler.ts.
 * Duplicated intentionally rather than importing (that function isn't
 * exported, and call-scheduler.ts's quarter job is keyed off "now"; this one
 * buckets an arbitrary requested time) — see .agents/memory for context.
 */
// Ray's quarter boundaries (2026-08-14): Q1 morning 6-10, Q2 midday 10-2,
// Q3 fun block 2-6, Q4 wind-down 6pm onward (incl. overnight). Keep in sync
// with computeCurrentQuarter (routes/state.ts) and computeQuarterForHour
// (lib/call-scheduler.ts).
export function quarterForHour(hour: number): Quarter {
  if (hour >= 6 && hour < 10) return "Q1";
  if (hour >= 10 && hour < 14) return "Q2";
  if (hour >= 14 && hour < 18) return "Q3";
  return "Q4";
}

export function quarterForTime(hhmm: string): Quarter {
  const hour = parseInt(hhmm.split(":")[0] ?? "0", 10);
  return quarterForHour(hour);
}

/**
 * Normalizes a spoken/typed time into strict 24-hour "HH:MM". The ElevenLabs
 * tool parameters instruct the LLM to always send 24-hour HH:MM, but this
 * defensively also accepts common variants ("3pm", "3:00 PM", "0900") in
 * case a less-normalized value slips through — maximizes the odds of a
 * successful voice request instead of making Jessica ask again for
 * something a human would understand fine. Returns null if nothing
 * reasonable could be parsed, so the caller can ask for clarification.
 */
export function normalizeTimeToHHMM(input: string): string | null {
  const raw = input.trim().toLowerCase();

  // Canonical: HH:MM 24-hour (also accepts a single leading digit, "9:00")
  let m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (m) {
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  }

  // "3pm", "3 pm", "3:30pm", "12:00 am"
  m = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ?? "00";
    if (h < 1 || h > 12) return null;
    if (m[3] === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
    return `${String(h).padStart(2, "0")}:${min}`;
  }

  // Bare 3-4 digit military time: "900", "0900", "1730"
  m = raw.match(/^(\d{1,2})(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }

  return null;
}

/**
 * "15:00" -> "3:00 PM" — for Jessica's SPOKEN confirmation only ("I've moved
 * it to 3:00 PM"). Do not persist this into schedule_tasks.timeLabel: every
 * existing task (seeded and Admin-created) stores/display that column as
 * raw 24-hour "HHMM" with no colon or AM/PM (e.g. "0600", "1900"), rendered
 * as-is verbatim on both the Admin dashboard and Pops' kiosk ("AT 0600").
 * Use toStoredTimeLabel() for the persisted value instead.
 */
export function formatTimeLabel(hhmm: string): string {
  const [hStr, min] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${period}`;
}

/** "15:00" -> "1500" — matches the raw HHMM (no colon) convention every schedule_tasks.timeLabel value already uses. This is what actually gets persisted. */
export function toStoredTimeLabel(hhmm: string): string {
  return hhmm.replace(":", "");
}

export interface ScheduleTaskRow {
  id: number;
  title: string;
  quarter: string;
  timeLabel: string;
  description: string | null;
  order: number;
}

/**
 * Finds active schedule_tasks rows matching a spoken title/keyword, for
 * remove/reschedule voice requests. An exact case-insensitive match wins
 * outright; otherwise falls back to substring matching in either direction
 * ("walk" matches "Afternoon Walk"; "the afternoon walk task" matches
 * "Afternoon Walk"). Returns every candidate so the caller can tell an
 * unambiguous single match from one that needs spoken clarification.
 */
export async function findTaskMatches(tenantId: string, titleQuery: string): Promise<ScheduleTaskRow[]> {
  const query = titleQuery.trim().toLowerCase();
  if (!query) return [];

  const rows = await db
    .select({
      id: scheduleTasksTable.id,
      title: scheduleTasksTable.title,
      quarter: scheduleTasksTable.quarter,
      timeLabel: scheduleTasksTable.timeLabel,
      description: scheduleTasksTable.description,
      order: scheduleTasksTable.order,
    })
    .from(scheduleTasksTable)
    .where(and(eq(scheduleTasksTable.tenantId, tenantId), eq(scheduleTasksTable.isActive, true)));

  const exact = rows.filter((r) => r.title.trim().toLowerCase() === query);
  if (exact.length > 0) return exact;

  return rows.filter((r) => {
    const t = r.title.toLowerCase();
    return t.includes(query) || query.includes(t);
  });
}

/**
 * timeLabel is free-form text in practice (raw "HHMM", or arbitrary strings
 * like "TBD" from imported documents) — only reformat it for speech when it
 * actually looks like a 4-digit 24-hour time, otherwise speak it verbatim.
 */
export function speakableTimeLabel(timeLabel: string): string {
  const m = timeLabel.trim().match(/^([01]\d|2[0-3])([0-5]\d)$/);
  if (!m) return timeLabel;
  return formatTimeLabel(`${m[1]}:${m[2]}`);
}

export function describeTasks(tasks: ScheduleTaskRow[]): string {
  return tasks.map((t) => `"${t.title}" at ${speakableTimeLabel(t.timeLabel)}`).join(", ");
}

/** Appends after the last task in a quarter instead of a fixed magic-number order. */
export async function nextOrderInQuarter(tenantId: string, quarter: string): Promise<number> {
  const rows = await db
    .select({ order: scheduleTasksTable.order })
    .from(scheduleTasksTable)
    .where(and(eq(scheduleTasksTable.tenantId, tenantId), eq(scheduleTasksTable.quarter, quarter)));
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.order)) + 1;
}

// ─── Tool-call authentication ────────────────────────────────────────────────
// ElevenLabs webhook tools authenticate to us via a static shared-secret
// header we control end-to-end: we generate it, embed it in each tool's
// request_headers when we register the tool with ElevenLabs (see
// lib/elevenlabs-tools-sync.ts), and check it here on every incoming tool
// call. It's an internal token (not a user credential), so it's generated
// and stored in app_settings rather than requested as a Replit Secret —
// nobody ever needs to type it in or see it.
const TOOL_SECRET_KEY = "jessica_tool_secret";

export async function getJessicaToolSecret(): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, TOOL_SECRET_KEY));
  return rows[0]?.value ?? null;
}

/** Generates and persists the secret if one doesn't exist yet. Only called from the sync routine — the auth check itself only reads, so a forged request can never trigger secret creation. */
export async function ensureJessicaToolSecret(): Promise<string> {
  const existing = await getJessicaToolSecret();
  if (existing) return existing;
  const secret = randomBytes(32).toString("hex");
  await db.insert(appSettingsTable).values({ key: TOOL_SECRET_KEY, value: secret });
  return secret;
}

export function toolSecretMatches(provided: string | undefined | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Caller-identity check (Ray vs. Pops) ────────────────────────────────────
// The shared tool secret above only proves "this request came from
// ElevenLabs' infrastructure" — it says nothing about which human is
// actually on the call. That's fine for the task-CRUD tools (add/remove/
// reschedule), which this feature's own spec treats as usable by whoever is
// speaking, e.g. Pops self-reporting "add a task to take my pills." It is
// NOT fine for update_daily_call_schedule: without a real check, Pops (or
// any misclassified/manipulated conversation) could silently turn off his
// own safety-critical daily call, since "only Ray should do this" would
// otherwise exist purely as an LLM prompt instruction, not an enforced
// boundary.
//
// Mechanism: ElevenLabs automatically populates system dynamic variables
// per-call, including the outbound-dialed number (`system__called_number`)
// and, for a future inbound call, the inbound caller's number
// (`system__caller_id`) — see
// https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables.
// We template both into this tool's request_headers (elevenlabs-tools-sync.ts)
// so they arrive with every call. Every real outbound call today dials
// either Pops' number (daily/appointment cron jobs, and the default manual
// "Call Pops Now") or ADMIN_PHONE_NUMBER (only via the explicit `test: true`
// flag on the manual, session-gated call route) — so matching either header
// against ADMIN_PHONE_NUMBER is currently the only legitimate "this call is
// with Ray" signal that exists, and it also transparently covers a genuine
// inbound call from Ray's own number if inbound calling is ever added.
//
// Fails closed by design: an unconfigured ADMIN_PHONE_NUMBER, missing
// headers (e.g. the variables not resolving, or a non-voice invocation), or
// a genuine mismatch all deny the change.
//
// Compares on the last 10 digits (US national number) rather than the full
// digit string: both values here describe the same phone number end to
// end, but aren't guaranteed to be byte-for-byte identical (a leading "+1"
// country code may or may not be present depending on how the number was
// stored vs. how it comes back from ElevenLabs/Twilio). Requiring at least
// 10 digits also means a missing/blank/too-short value never satisfies the
// comparison, including the pathological case of ADMIN_PHONE_NUMBER itself
// being unset or malformed.
function last10Digits(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function isCallWithRay(calledNumber: string | undefined | null, callerId: string | undefined | null): boolean {
  const admin = last10Digits(process.env["ADMIN_PHONE_NUMBER"]);
  if (!admin) return false;
  const called = last10Digits(calledNumber);
  const caller = last10Digits(callerId);
  return called === admin || caller === admin;
}
