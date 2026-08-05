#!/usr/bin/env node
// Guardian — Lane 1 (Appointments) runner.
//
// Care data is deliberately kept outside this repository. Set GUARDIAN_CARE_DIR
// to the Ray-authored care directory, or use ~/.guardian/care.
//
//   node appointments.mjs plan
//   node appointments.mjs tick                 # dry-run
//   node appointments.mjs tick --live
//   node appointments.mjs anchor <id>
//   node appointments.mjs confirm <id>
//   node appointments.mjs status

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CARE_DIR = process.env.GUARDIAN_CARE_DIR ?? join(homedir(), ".guardian", "care");
const [command = "tick", ...args] = process.argv.slice(2);
const live = args.includes("--live");
const argument = args.find((arg) => !arg.startsWith("--"));
const BANNED = ["hurry", "must", "forgot", "should have"];

function assertToneSafe(line) {
  const hit = BANNED.find((word) => new RegExp(`\\b${word}\\b`, "i").test(line));
  if (hit) throw new Error(`tone violation: "${hit}" in Pops-facing line: ${line}`);
  return line;
}

function readJson(path, description) {
  if (!existsSync(path)) {
    console.error(`Missing ${description}: ${path}`);
    console.error("Care data is Ray-authored and lives outside the repository. See README.");
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid ${description} JSON at ${path}: ${error.message}`);
  }
}

const config = readJson(join(CARE_DIR, "config.json"), "config");
const allAppointments = readJson(join(CARE_DIR, "appointments.json"), "appointments");
if (!Array.isArray(allAppointments)) throw new Error("appointments.json must contain an array");
// A canceled appointment must never produce a heads-up, a prep step, or a call.
// Kept in the file for the record; filtered out of every code path here.
const appointments = allAppointments.filter((a) => a.status !== "canceled");

const TZ = config.timeZone ?? "America/Los_Angeles";
const STALL_MINUTES = config.stallMinutes ?? 20;
const EVENING_AT = config.eveningHeadsUpTime ?? "18:00";
const COMPILE_AT = config.compileTime ?? "17:00";
// Proactivity knobs. The real deadline is when the car leaves, not the
// appointment time — every warning below is measured against departAt.
const TRAVEL_MINUTES = config.defaultTravelMinutes ?? 45;
const PREP_BUDGET_MINUTES = config.prepBudgetMinutes ?? 30;
const FINAL_WARN_MINUTES = config.finalWarningMinutes ?? 30;
const MORNING_AT = config.morningNoticeTime ?? "07:00";
const ANCHORS = config.anchors ?? {
  after_breakfast: { phrase: "after breakfast", earliest: "08:00", latest: "10:30" },
};
const stateDir = join(CARE_DIR, "state");
const logDir = join(CARE_DIR, "logs");
if (command !== "plan") {
  mkdirSync(stateDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
}
const statePath = join(stateDir, "appointments-state.json");
const state = existsSync(statePath)
  ? readJson(statePath, "appointment state")
  : { appts: {}, notices: {} };
state.appts ??= {};
state.notices ??= {};
const saveState = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

function localDate(epoch) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(epoch));
}

function localClock(epoch) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(epoch));
}

function timeZoneOffset(epoch) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(epoch));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const hour = values.hour === "24" ? "00" : values.hour;
  return Date.UTC(+values.year, +values.month - 1, +values.day, +hour, +values.minute, +values.second) - epoch;
}

function zonedToEpoch(date, time) {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(naive)) throw new Error(`Invalid local date/time: ${date} ${time}`);
  let epoch = naive;
  for (let i = 0; i < 3; i += 1) epoch = naive - timeZoneOffset(epoch);
  return epoch;
}

function addDays(date, amount) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function partOfDay(epoch) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(epoch)));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

function appointmentState(id) {
  state.appts[id] ??= { headsUp: null, compiled: null, anchorMet: null, stepIndex: 0, steps: {}, done: false };
  return state.appts[id];
}

function log(event, data = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...data });
  appendFileSync(join(logDir, `${localDate(Date.now())}.jsonl`), `${line}\n`);
  console.log(line);
}

function timeline(appointment) {
  const at = Date.parse(appointment.datetime);
  if (!Number.isFinite(at)) throw new Error(`Invalid datetime for appointment ${appointment.id}`);
  const day = localDate(at);
  const anchorKey = appointment.anchor ?? "after_breakfast";
  const anchor = ANCHORS[anchorKey] ?? ANCHORS.after_breakfast;
  if (!anchor) throw new Error(`Unknown anchor "${anchorKey}" for ${appointment.id}`);
  const isPsychMed = appointment.psychMed === true || /psych|med/i.test(String(appointment.type ?? appointment.category ?? ""));
  return {
    at,
    day,
    anchor,
    isPsychMed,
    headsUpAt: zonedToEpoch(addDays(day, -1), EVENING_AT),
    compileAt: zonedToEpoch(addDays(day, -1), COMPILE_AT),
    morningAt: zonedToEpoch(day, MORNING_AT),
    departAt: at - (appointment.travelMinutes ?? TRAVEL_MINUTES) * 60_000,
    anchorEarliest: zonedToEpoch(day, anchor.earliest),
    anchorLatest: zonedToEpoch(day, anchor.latest),
  };
}

// Back-to-back at the same clinic is how the VA books; that is not a conflict.
// Only flag a tight gap that also requires getting somewhere else.
function conflicts(list) {
  const sorted = [...list].sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime));
  const minimumGap = (config.minAppointmentGapMinutes ?? 90) * 60_000;
  const result = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = Date.parse(sorted[i].datetime) - Date.parse(sorted[i - 1].datetime);
    const samePlace = sorted[i].location && sorted[i].location === sorted[i - 1].location;
    if (gap < minimumGap && !samePlace) result.push([sorted[i - 1].id, sorted[i].id, Math.round(gap / 60_000)]);
  }
  return result;
}

let cachedToken = null;
async function mintToken() {
  if (process.env.GUARDIAN_LOCAL_TOKEN) return process.env.GUARDIAN_LOCAL_TOKEN;
  const passphrase = process.env.GUARDIAN_VAULT_PASSPHRASE;
  if (!passphrase) throw new Error("Set GUARDIAN_LOCAL_TOKEN or GUARDIAN_VAULT_PASSPHRASE.");
  const response = await fetch(`${config.apiBase}/tenants/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase }),
  });
  if (!response.ok) throw new Error(`auth failed: HTTP ${response.status}`);
  const body = await response.json();
  if (body.type !== "local" || !body.token) throw new Error(`auth returned unexpected session type: ${body.type}`);
  return body.token;
}

async function toPops(appointmentId, kind, line) {
  assertToneSafe(line);
  if (!live) { log("dry-run.pops", { appointmentId, kind, intendedLine: line }); return { dryRun: true }; }
  cachedToken ??= await mintToken();
  const response = await fetch(`${config.apiBase}/jessica/outbound-call`, {
    method: "POST", headers: { Authorization: `Bearer ${cachedToken}` },
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`call failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  log("call.placed", { appointmentId, kind, intendedLine: line, contextInjected: false, sessionId: body.sessionId });
  return body;
}

async function toRay(message) {
  if (!config.ntfyTopic) { log("ray.notice", { message, delivered: false, reason: "no ntfy topic" }); return; }
  if (!live) { log("dry-run.ray", { message }); return; }
  try {
    const response = await fetch(`https://ntfy.sh/${config.ntfyTopic}`, { method: "POST", body: message });
    log(response.ok ? "ray.notice" : "ray.notice.failed", { message, delivered: response.ok, status: response.status });
  } catch (error) { log("ray.notice.failed", { message, error: error.message }); }
}

if (command === "plan") {
  console.log(`\nGuardian — appointment lane (${TZ})`);
  console.log(`Care dir: ${CARE_DIR}`);
  console.log(`API: ${config.apiBase ?? "(not configured)"}\n`);
  for (const appointment of appointments) {
    const t = timeline(appointment);
    console.log(`${appointment.id}  ${appointment.provider}${appointment.location ? `  (${appointment.location})` : ""}`);
    console.log(`   T-1 ${localClock(t.headsUpAt)}  heads-up to Pops`);
    if (t.isPsychMed) console.log(`   T-1 ${localClock(t.compileAt)}  compile summary -> Ray reviews`);
    console.log(`   morning-of  anchor window ${t.anchor.earliest}–${t.anchor.latest} (${t.anchor.phrase})`);
    (appointment.prep_steps ?? []).forEach((step, index) => console.log(`   ${index + 1}: ${step}  [confirm before next]`));
    if (appointment.questions?.length) console.log(`   ${appointment.questions.length} question(s) held for the doctor`);
    console.log();
  }
  for (const [a, b, minutes] of conflicts(appointments)) console.log(`CONFLICT: ${a} and ${b} are ${minutes} min apart — flagged to Ray, never auto-rescheduled.`);
  process.exit(0);
}

if (command === "status") {
  for (const appointment of appointments) {
    const current = appointmentState(appointment.id);
    const steps = appointment.prep_steps ?? [];
    console.log(`${appointment.id}  headsUp=${current.headsUp ? "sent" : "-"}  compiled=${current.compiled ? "yes" : "-"}  anchor=${current.anchorMet ? "met" : "-"}  steps=${Math.min(current.stepIndex, steps.length)}/${steps.length}  ${current.done ? "DONE" : ""}`);
  }
  process.exit(0);
}

if (command === "anchor") {
  if (!argument) { console.error("usage: anchor <appointmentId>"); process.exit(2); }
  appointmentState(argument).anchorMet = new Date().toISOString();
  saveState();
  log("anchor.met", { appointmentId: argument });
  process.exit(0);
}

if (command === "confirm") {
  if (!argument) { console.error("usage: confirm <appointmentId>"); process.exit(2); }
  const appointment = appointments.find(({ id }) => id === argument);
  if (!appointment) { console.error(`no appointment "${argument}"`); process.exit(2); }
  const current = appointmentState(argument);
  const index = current.stepIndex;
  if (!current.steps[index]) { console.error("no prep step has been delivered yet"); process.exit(2); }
  current.steps[index].confirmedAt = new Date().toISOString();
  current.stepIndex = index + 1;
  if (current.stepIndex >= (appointment.prep_steps ?? []).length) current.done = true;
  saveState();
  log("step.confirmed", { appointmentId: argument, step: index + 1, done: current.done });
  process.exit(0);
}

if (command !== "tick") { console.error(`unknown command "${command}"; use plan, tick, anchor, confirm, or status`); process.exit(2); }

const now = Date.now();
for (const [a, b, minutes] of conflicts(appointments)) {
  const key = `${a}:${b}`;
  if (!state.notices[`conflict:${key}`]) { state.notices[`conflict:${key}`] = true; saveState(); await toRay(`Appointments ${a} and ${b} are ${minutes} minutes apart. Needs your call.`); }
}

let spokeToPops = false;
for (const appointment of appointments) {
  const current = appointmentState(appointment.id);
  if (current.done) continue;
  const t = timeline(appointment);
  const steps = appointment.prep_steps ?? [];

  if (t.isPsychMed && !current.compiled && now >= t.compileAt && now < t.at) {
    current.compiled = new Date().toISOString();
    saveState();
    log("compile.due", { appointmentId: appointment.id, engine: "not implemented" });
    await toRay("A clinical appointment summary is ready for review.");
  }

  // Only on the eve. If Guardian was asleep through the evening the moment has
  // passed — saying "tomorrow" on the day itself would be false and confusing.
  if (!current.headsUp && now >= t.headsUpAt && localDate(now) === addDays(t.day, -1)) {
    if (spokeToPops) continue;
    const line = `Tomorrow ${partOfDay(t.at)} is ${appointment.provider}. I'll help you get ready ${t.anchor.phrase}.`;
    try {
      await toPops(appointment.id, "heads_up", line);
      current.headsUp = new Date().toISOString();
      spokeToPops = true;
      saveState();
      await toRay("Appointment heads-up delivered.");
    } catch (error) { log("heads_up.failed", { appointmentId: appointment.id, error: error.message }); await toRay("Guardian offline — heads-up not delivered."); }
    continue;
  }

  if (localDate(now) !== t.day || !current.anchorMet) {
    if (localDate(now) === t.day && now > t.anchorLatest && !state.notices[`anchorMissed:${appointment.id}`]) {
      state.notices[`anchorMissed:${appointment.id}`] = true;
      saveState();
      await toRay(`Anchor "${t.anchor.phrase}" hasn't been marked. Prep is waiting.`);
    }
    continue;
  }

  const index = current.stepIndex;
  if (index >= steps.length) { current.done = true; saveState(); continue; }
  const delivered = current.steps[index];
  if (!delivered) {
    if (spokeToPops) continue;
    try {
      await toPops(appointment.id, `prep_step_${index + 1}`, steps[index]);
      current.steps[index] = { deliveredAt: new Date().toISOString(), confirmedAt: null, stallNotified: false };
      spokeToPops = true;
      saveState();
    } catch (error) { log("step.failed", { appointmentId: appointment.id, step: index + 1, error: error.message }); await toRay(`Guardian offline — prep step ${index + 1} not delivered.`); }
    continue;
  }

  if (!delivered.confirmedAt && !delivered.stallNotified && now - Date.parse(delivered.deliveredAt) >= STALL_MINUTES * 60_000) {
    delivered.stallNotified = true;
    saveState();
    await toRay(`Prep stalled at step ${index + 1}.`);
  }
}
