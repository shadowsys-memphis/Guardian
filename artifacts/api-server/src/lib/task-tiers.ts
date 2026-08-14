/**
 * Priority tiers, task outcomes, and the shared escalation ladder.
 *
 * This is the foundation the rest of the daily-routine system builds on: one
 * place that answers "how hard does Jessica push on this, and how fast does
 * Ray hear about it?" — driven by a task's tier rather than duplicated per
 * feature (morning wake-up, medication calls, chores, evening check-in).
 *
 * Nothing in here places calls or writes to the database. It is pure policy,
 * so it can be reasoned about (and corrected) without touching the scheduler.
 */

// ─── Tiers ───────────────────────────────────────────────────────────────────

/** Ordered most- to least-critical. Index doubles as the escalation rank. */
export const TASK_TIERS = [
  "safety",
  "medication",
  "meals_hydration",
  "sleep",
  "hygiene_koda",
  "routine",
] as const;

export type TaskTier = (typeof TASK_TIERS)[number];

export const DEFAULT_TIER: TaskTier = "routine";

/** Lower number = more critical. Use for sorting and for "at least this tier" checks. */
export function tierRank(tier: TaskTier): number {
  return TASK_TIERS.indexOf(tier);
}

export function isTaskTier(value: unknown): value is TaskTier {
  return typeof value === "string" && (TASK_TIERS as readonly string[]).includes(value);
}

/**
 * The two tiers that feed the "critical" half of the daily score, plus the
 * meals/sleep tiers — everything except hygiene and routine. Kept here rather
 * than in the dashboard so the score and the escalation ladder can never drift
 * apart on what "critical" means.
 */
export const CRITICAL_TIERS: readonly TaskTier[] = ["safety", "medication", "meals_hydration", "sleep"];

export function isCriticalTier(tier: TaskTier): boolean {
  return CRITICAL_TIERS.includes(tier);
}

// ─── Outcomes ────────────────────────────────────────────────────────────────

/**
 * A task's real outcome. The distinction that matters most here is
 * `refused` vs `no_answer`: "he told me no" and "he never picked up the phone"
 * are different clinical signals and different escalations, and the old
 * boolean `is_completed` column could represent neither.
 *
 * `missed` is terminal-by-timeout: the window closed with no resolution.
 */
export const TASK_STATUSES = ["pending", "done", "refused", "no_answer", "missed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

/** A status no further ladder step should act on. */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === "done" || status === "missed" || status === "refused";
}

/**
 * How a completion was confirmed. "Done" is never recorded without one of
 * these — an assumed completion and a spoken confirmation are not the same
 * evidence, and the medication protocol depends on being able to tell them
 * apart after the fact.
 */
export const COMPLETION_SOURCES = ["spoken", "family", "sensor", "admin"] as const;
export type CompletionSource = (typeof COMPLETION_SOURCES)[number];

export function isCompletionSource(value: unknown): value is CompletionSource {
  return typeof value === "string" && (COMPLETION_SOURCES as readonly string[]).includes(value);
}

// ─── Late / missed policy ────────────────────────────────────────────────────

/**
 * What happens when a task runs past its time window.
 *
 * - `never_shift` — the task stays pinned to its scheduled time and is never
 *   silently moved. Medication uses this: a dose quietly rescheduled to two
 *   hours later is a dosing-interval change nobody approved.
 * - `move_forward` — may slide later within the same day, but never past it.
 * - `expire` — closes as `missed` once the window elapses, no escalation.
 *
 * No policy carries anything into the next day. A missed task is missed.
 */
export type LatePolicy = "never_shift" | "move_forward" | "expire";

export interface TierPolicy {
  /** How many times Jessica attempts the task before the ladder gives up. */
  maxAttempts: number;
  /** Minutes to wait between attempts. */
  retryAfterMinutes: number;
  /**
   * Notify Ray once this many attempts have been made without resolution.
   * `null` = never notify on silence alone (low-priority items).
   */
  notifyRayAfterAttempts: number | null;
  /** Notify Ray the moment Pops actively refuses, without waiting out the retries. */
  notifyRayOnRefusal: boolean;
  latePolicy: LatePolicy;
  /**
   * Minutes after the scheduled time at which an unresolved task closes as
   * `missed`. `null` = never auto-closes; it stays open for the day and is
   * only ever resolved by a person or by the end-of-day reset.
   */
  expireAfterMinutes: number | null;
}

/**
 * The ladder itself.
 *
 * These numbers are deliberately conservative and are expected to be tuned
 * against real days with Pops. They are policy, not physics — change them
 * here and every feature that uses the ladder changes with them.
 */
export const TIER_POLICY: Record<TaskTier, TierPolicy> = {
  safety: {
    maxAttempts: 3,
    retryAfterMinutes: 5,
    notifyRayAfterAttempts: 1,
    notifyRayOnRefusal: true,
    latePolicy: "never_shift",
    expireAfterMinutes: null,
  },
  medication: {
    maxAttempts: 3,
    retryAfterMinutes: 15,
    notifyRayAfterAttempts: 3,
    notifyRayOnRefusal: true,
    latePolicy: "never_shift",
    expireAfterMinutes: null,
  },
  meals_hydration: {
    maxAttempts: 2,
    retryAfterMinutes: 30,
    notifyRayAfterAttempts: 2,
    notifyRayOnRefusal: false,
    latePolicy: "move_forward",
    expireAfterMinutes: 240,
  },
  sleep: {
    maxAttempts: 2,
    retryAfterMinutes: 20,
    notifyRayAfterAttempts: 2,
    notifyRayOnRefusal: false,
    latePolicy: "move_forward",
    expireAfterMinutes: 180,
  },
  hygiene_koda: {
    maxAttempts: 1,
    retryAfterMinutes: 60,
    notifyRayAfterAttempts: null,
    notifyRayOnRefusal: false,
    latePolicy: "expire",
    expireAfterMinutes: 240,
  },
  routine: {
    maxAttempts: 1,
    retryAfterMinutes: 60,
    notifyRayAfterAttempts: null,
    notifyRayOnRefusal: false,
    latePolicy: "expire",
    expireAfterMinutes: 180,
  },
};

export function policyForTier(tier: TaskTier): TierPolicy {
  return TIER_POLICY[tier];
}

// ─── The ladder step function ────────────────────────────────────────────────

export type LadderAction =
  /** Nothing to do — task is resolved, or not due yet. */
  | { kind: "none" }
  /** Wait until `readyAtMs` before the next attempt. */
  | { kind: "wait"; readyAtMs: number }
  /** Attempt the task now (this will be attempt number `attempt`). */
  | { kind: "attempt"; attempt: number }
  /** Pull Ray in. `reason` distinguishes refusal from repeated silence. */
  | { kind: "notify_ray"; reason: "refused" | "no_answer" | "attempts_exhausted" }
  /** Close the task as missed — the window elapsed with no resolution. */
  | { kind: "close_missed" };

export interface LadderState {
  tier: TaskTier;
  status: TaskStatus;
  attemptCount: number;
  /** Epoch ms of the last attempt, or null if never attempted. */
  lastAttemptAtMs: number | null;
  /** Epoch ms at which Ray was already notified, or null. */
  escalatedAtMs: number | null;
  /** Epoch ms of the task's scheduled time today. */
  scheduledAtMs: number;
}

/**
 * Decide the single next ladder step for one task.
 *
 * Pure and total: same inputs always give the same answer, and every branch
 * returns. The caller is responsible for actually performing the action and
 * writing back `attemptCount` / `lastAttemptAt` / `escalatedAt` / `status`.
 *
 * Order of checks matters:
 *  1. Refusal escalates immediately for tiers that ask for it — waiting out
 *     retries after an explicit "no" just delays Ray finding out.
 *  2. Expiry is checked before further attempts, so a long-elapsed task closes
 *     rather than firing a stale retry hours late.
 */
export function nextLadderStep(state: LadderState, nowMs: number): LadderAction {
  const policy = policyForTier(state.tier);

  if (state.status === "done" || state.status === "missed") return { kind: "none" };

  if (state.status === "refused") {
    if (policy.notifyRayOnRefusal && state.escalatedAtMs === null) {
      return { kind: "notify_ray", reason: "refused" };
    }
    return { kind: "none" };
  }

  // Not yet due.
  if (nowMs < state.scheduledAtMs) return { kind: "none" };

  const elapsedMinutes = (nowMs - state.scheduledAtMs) / 60_000;
  const expired = policy.expireAfterMinutes !== null && elapsedMinutes >= policy.expireAfterMinutes;

  if (expired) {
    // A tier that wants Ray told about repeated silence gets that notification
    // before the task closes — otherwise the miss would close silently and the
    // notification would never fire at all.
    if (
      policy.notifyRayAfterAttempts !== null &&
      state.attemptCount >= policy.notifyRayAfterAttempts &&
      state.escalatedAtMs === null
    ) {
      return { kind: "notify_ray", reason: "no_answer" };
    }
    return { kind: "close_missed" };
  }

  if (state.attemptCount >= policy.maxAttempts) {
    if (state.escalatedAtMs === null && policy.notifyRayAfterAttempts !== null) {
      return { kind: "notify_ray", reason: "attempts_exhausted" };
    }
    // Attempts are spent and Ray has been told (or this tier never tells him).
    // Nothing further happens until the task expires or someone resolves it.
    return { kind: "none" };
  }

  if (state.lastAttemptAtMs !== null) {
    const readyAtMs = state.lastAttemptAtMs + policy.retryAfterMinutes * 60_000;
    if (nowMs < readyAtMs) return { kind: "wait", readyAtMs };
  }

  return { kind: "attempt", attempt: state.attemptCount + 1 };
}

// ─── Tier inference (backfill / seeding aid) ─────────────────────────────────

/**
 * Best-effort tier guess from a task title, used ONLY to backfill rows that
 * predate the tier column and to pre-fill the tier when a task is created by
 * voice with no tier given.
 *
 * Deliberately biased toward over-classifying: the dangerous error is a real
 * medication sitting at `routine` where nothing escalates, not a chore sitting
 * at `medication` where Ray gets one notification too many. Anything it can't
 * recognize stays at the default tier and should be corrected by hand.
 */
export function inferTierFromTitle(title: string): TaskTier {
  const t = title.toLowerCase();
  if (/\b(fall|emergency|911|panic|unsafe|stove|smoke|wander)\b/.test(t)) return "safety";
  if (/\b(med|meds|medication|pill|pills|dose|haldol|injection|prescription|rx)\b/.test(t)) return "medication";
  if (/\b(breakfast|lunch|dinner|snack|meal|eat|water|hydrat|drink|fluid)\b/.test(t)) return "meals_hydration";
  if (/\b(sleep|bed|bedtime|nap|wake|wake-up|goodnight|lights out)\b/.test(t)) return "sleep";
  if (/\b(shower|bathe|bath|teeth|brush|deodorant|hygiene|dress|clothes|koda|dog|walk|feed)\b/.test(t)) return "hygiene_koda";
  return DEFAULT_TIER;
}
