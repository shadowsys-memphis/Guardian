#!/usr/bin/env node
// Jessica call scheduler — zero-dependency, local-session only.
//
// Fires POST /jessica/outbound-call at times derived from the day's appointments.
// That route is requireLocalSession (LOCAL tier), so this must run on Ray's machine
// with the vault passphrase — it cannot run as a cloud cron.
//
// Safety posture: dry-run unless --live. Never double-dials (state file is
// authoritative). Never dials a job that is more than graceMinutes late — a
// reminder that fires hours after the appointment is worse than no reminder.
//
//   node scheduler.mjs --plan            print today's call plan, touch nothing
//   node scheduler.mjs                   dry-run: log what WOULD fire right now
//   node scheduler.mjs --live            actually place due calls
//
// Env (never logged): GUARDIAN_VAULT_PASSPHRASE or GUARDIAN_LOCAL_TOKEN

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const LIVE = args.has("--live");
const PLAN_ONLY = args.has("--plan");

// ---------- time helpers (no deps; correct across DST) ----------

function tzOffsetMs(epoch, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(epoch));
  const m = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return Date.UTC(+m.year, +m.month - 1, +m.day, +hour, +m.minute, +m.second) - epoch;
}

// "2026-07-28" + "09:00" in a zone -> epoch ms
function zonedToEpoch(dateStr, timeStr, timeZone) {
  const naive = Date.parse(`${dateStr}T${timeStr}:00Z`);
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - tzOffsetMs(ts, timeZone);
  return ts;
}

function todayInZone(timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function clockInZone(epoch, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(epoch));
}

// ---------- config / state ----------

const configPath = join(TOOL_DIR, "config.json");
if (!existsSync(configPath)) {
  console.error(`No config.json at ${configPath}. Copy config.example.json and fill in today's appointments.`);
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(configPath, "utf8"));

const TZ = cfg.timeZone ?? "America/Los_Angeles";
const DATE = cfg.date && cfg.date !== "today" ? cfg.date : todayInZone(TZ);
const GRACE_MIN = cfg.graceMinutes ?? 20;
const MIN_GAP_MIN = cfg.minGapMinutes ?? 25;
const MAX_CALLS = cfg.maxCallsPerDay ?? 6;

const stateDir = join(TOOL_DIR, "state");
const logDir = join(TOOL_DIR, "logs");
mkdirSync(stateDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

const statePath = join(stateDir, `${DATE}.json`);
const logPath = join(logDir, `${DATE}.log`);

function loadState() {
  if (!existsSync(statePath)) return { date: DATE, fired: {} };
  return JSON.parse(readFileSync(statePath, "utf8"));
}
function saveState(s) {
  writeFileSync(statePath, JSON.stringify(s, null, 2) + "\n");
}
function log(event, data) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
  appendFileSync(logPath, line + "\n");
  console.log(line);
}

// ---------- build the day's call plan ----------

function buildPlan() {
  const jobs = [];
  for (const appt of cfg.appointments ?? []) {
    const apptEpoch = zonedToEpoch(DATE, appt.time, TZ);
    for (const call of appt.calls ?? []) {
      const at = apptEpoch + call.offsetMinutes * 60_000;
      jobs.push({
        id: `${DATE}:${appt.id}:${call.kind}:${call.offsetMinutes}`,
        apptId: appt.id,
        apptLabel: appt.label,
        apptTime: appt.time,
        kind: call.kind,
        offsetMinutes: call.offsetMinutes,
        at,
      });
    }
  }
  jobs.sort((a, b) => a.at - b.at);

  // Drop any job that lands too close to the one before it — Pops should never
  // get two calls back to back because two appointments sit near each other.
  const spaced = [];
  for (const j of jobs) {
    const prev = spaced[spaced.length - 1];
    if (prev && j.at - prev.at < MIN_GAP_MIN * 60_000) {
      j.suppressed = `within ${MIN_GAP_MIN}m of ${prev.id}`;
    }
    spaced.push(j);
  }
  return spaced;
}

// ---------- API ----------

async function mintToken() {
  const direct = process.env.GUARDIAN_LOCAL_TOKEN;
  if (direct) return direct;

  const passphrase = process.env.GUARDIAN_VAULT_PASSPHRASE;
  if (!passphrase) {
    throw new Error("Set GUARDIAN_VAULT_PASSPHRASE (or GUARDIAN_LOCAL_TOKEN). Never put it in config.json.");
  }
  const res = await fetch(`${cfg.apiBase}/tenants/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) throw new Error(`auth failed: HTTP ${res.status}`);
  const body = await res.json();
  if (body.type !== "local") throw new Error(`expected a local session, got "${body.type}"`);
  return body.token;
}

async function placeCall(token) {
  const res = await fetch(`${cfg.apiBase}/jessica/outbound-call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) throw new Error(`call failed: HTTP ${res.status} ${JSON.stringify(body)}`);
  return body;
}

// ---------- main ----------

const plan = buildPlan();
const now = Date.now();

if (PLAN_ONLY) {
  console.log(`\nJessica call plan — ${DATE} (${TZ})`);
  console.log(`API: ${cfg.apiBase}`);
  console.log(`Dials whichever number is saved as Pops' phone in Settings → Jessica.\n`);
  for (const j of plan) {
    const flag = j.suppressed ? `  SUPPRESSED (${j.suppressed})` : "";
    console.log(
      `  ${clockInZone(j.at, TZ).padStart(8)}  ${j.kind.padEnd(9)} ` +
      `${j.offsetMinutes >= 0 ? "+" : ""}${j.offsetMinutes}m  ${j.apptLabel} @ ${j.apptTime}${flag}`
    );
  }
  console.log(`\n${plan.filter(j => !j.suppressed).length} call(s) planned, cap ${MAX_CALLS}/day.\n`);
  process.exit(0);
}

const state = loadState();
const firedCount = Object.keys(state.fired).length;

const due = plan.filter(j =>
  !j.suppressed &&
  !state.fired[j.id] &&
  j.at <= now &&
  now - j.at <= GRACE_MIN * 60_000
);

// Anything past its grace window gets buried, not dialed late.
for (const j of plan) {
  if (!j.suppressed && !state.fired[j.id] && now - j.at > GRACE_MIN * 60_000) {
    state.fired[j.id] = { status: "missed", reason: `>${GRACE_MIN}m late`, at: new Date(j.at).toISOString() };
    log("missed", { job: j.id, scheduled: clockInZone(j.at, TZ) });
  }
}

if (due.length === 0) {
  saveState(state);
  process.exit(0);
}

if (firedCount >= MAX_CALLS) {
  log("capped", { firedCount, cap: MAX_CALLS });
  saveState(state);
  process.exit(0);
}

let token = null;
for (const j of due) {
  if (!LIVE) {
    log("dry-run", { job: j.id, kind: j.kind, appt: j.apptLabel, scheduled: clockInZone(j.at, TZ) });
    continue;
  }
  try {
    // Claim the job BEFORE dialing. A crash mid-call must never re-dial Pops.
    state.fired[j.id] = { status: "dialing", at: new Date().toISOString() };
    saveState(state);

    if (!token) token = await mintToken();
    const body = await placeCall(token);

    state.fired[j.id] = {
      status: "placed",
      at: new Date().toISOString(),
      elevenLabsConversationId: body.elevenLabsConversationId,
      sessionId: body.sessionId,
      conversationId: body.conversationId,
    };
    saveState(state);
    log("placed", {
      job: j.id, kind: j.kind, appt: j.apptLabel,
      elevenLabsConversationId: body.elevenLabsConversationId,
      sessionId: body.sessionId,
    });
  } catch (err) {
    state.fired[j.id] = { status: "failed", at: new Date().toISOString(), error: String(err.message ?? err) };
    saveState(state);
    log("failed", { job: j.id, error: String(err.message ?? err) });
  }
}
saveState(state);
