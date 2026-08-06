# Guardian — Team Handoff & Ground Truth
**Updated: 2026-08-06 (Day-1 readiness pass). Maintained by Claude Code in Replit. If you are an AI agent reading this, treat it as the current state of the project and verify against live systems before contradicting it.**

## Team contract (set by Ray, 2026-08-06)
- **Claude Code (Replit workspace)** — the ONLY agent that makes changes: code, git, DB, config.
- **Open Claw (Mac)** — read-only co-engineer. Reviews, verifies, advises. No commits, pushes, edits, clones, folders, or branches.
- **Replit Agent** — makes automatic checkpoint commits as `agent@replit.com`; not an intruder.
- **Ray** — the human. Decisions with real-world consequences (enabling calls, deploys, deletions) are his alone.
- Standing rules from Ray: never clone, never create folders or branches unprompted, act with verified evidence, plain language.

## Repo topology (settled — do not relitigate)
- **Working copy:** the Replit workspace (`/home/runner/workspace`). This is where development happens.
- **GitHub** (`shadowsys-memphis/Guardian`, master): backup + hub. An auto-push `post-commit` hook pushes every commit within seconds (installer: `scripts/install-autopush.sh`; on failure it writes `GITHUB-SYNC-FAILED.txt` at repo root — that file appearing means a human must look).
- **Mac folders:** dormant backups. `BrainGuard_local_backup_20260802` is synced as of Aug 6; `BrainGuardian_1.2` is a dead end. Do not develop in either.
- The 34 junk `subrepl-*` remotes were deleted Aug 5. Remaining remotes: `origin`, `gitsafe-backup`.

## Medical ground truth (CONFIRMED BY RAY — do not "correct" from stale docs)
- **Haldol is MONTHLY: every 28 days.** Last shot **2026-08-05** (corrected by Ray 2026-08-06 — cycle restarted with Aug 5 as day 1; earlier note said Aug 6), next due **2026-09-02**. Dose was halved at Dr Uddin visit 2026-07-28 (exact mg pending After Visit Summary).
- Every hardcoded 14-day/biweekly reference was purged Aug 6 (defaults, Jessica's prompt, AI clinical summary, admin UI, calendar, schema, docs). If you find a "14-day" reference anywhere, it is a bug — report it, don't reintroduce it.
- Zombie/high-symptom window: days 1–5 post-shot (currently Aug 5–9) — Jessica's tone auto-softens.

## System state (verified live, post-restart Aug 6)
- API server healthy on port 8080 (`/api` prefix). Cron scheduler running with all 8 jobs.
- **Security:** `VAULT_PASSPHRASE` secret is set; the legacy "accept any passphrase" hole is CLOSED (fake passphrase → 401, verified). All pre-lock sessions revoked — every device must log in once with the new passphrase.
- **Lab tracker:** was dead (tables never created) — `lab_protocols`, `lab_phases`, `lab_draws` created Aug 6, endpoints 200.
- All feature endpoints audited live Aug 6: shopper (loaded), schedule, inventory, health-assessment, scripts, smarthome, rotation, symptoms, state, cron — all working. Appointments/medications/documents/cravings wired but empty (unused, not broken).
- Both call-placing cron jobs (`daily_call`, `appointment_reminder`) now gate on the single master switch `dailyCallEnabled` (fixed Aug 6 — reminder job was previously ungated).

## `Knowledgebase/artifacts/` — RESOLVED and deleted Aug 6

The docs vault used to contain a stale snapshot of all three artifact source folders under the **same package names** (`@workspace/api-server`, etc.). It triggered a false alarm that two cron schedulers were running and would call Pops twice. **That alarm was wrong** — nothing was ever running from it. Verified at the time: `.replit` registered only the real `artifacts/*` paths, `pnpm -r list` resolved to the real paths, the copies had no `node_modules` so could not start, one server process was running, and `cron_job_log` had **zero** duplicate rows in 3 days.

The copies were then deleted (173 files, in commit `d39cbca`). Post-deletion state verified: **21 doc files remain, 0 under `artifacts/`.** All docs folders intact — `00_System_Map`, `01_Runbooks`, `02_Registry`, `03_Agents`, `04_Models`, `06_Incidents`, `07_Prompts`, `08_Decisions`, `12_LM_Studio`, `13_Security_and_Boundaries`, `Bldr Notes`. (This also explains the old "194 of 204 files" note — 194 = 173 duplicate source files + 21 real docs.)

**Deleting them was correct, and one file made it urgent.** `haldolService.ts` in the snapshot contained `const cycleDay = diffDays % 14` with a doc comment reading "a repeating 14-day cycle" — the exact hardcoded biweekly logic purged everywhere else, superseded by `lib/haldol-cycle.ts` reading the prescriber-set `interval_days` (28). Pops is on a **28-day** cycle. Had anything reused that file it would have reported the wrong cycle day and a phantom injection day every 14 days. Nothing is lost — full history is in git (removal commits `61c5421`, `98a0acd`, `62f16ac`).

## Settings consolidation — DONE Aug 6 (commit `2ba8549`)

The half-finished migration is closed out: the daily call toggle + call time now live on `/settings` → Jessica tab, `SystemJobsPanel` (cron monitor) moved to `src/components/system-jobs-panel.tsx` and renders on a new `/settings` → System tab, and the unreachable `AppSettingsTab` in `admin-view.tsx` was deleted along with the `"settings"` `Tab` union member. Built to the locked spec in `docs/spec-settings-consolidation.md`. Ray republished the same morning.

## Day-1 readiness for the calling system — IN PROGRESS Aug 6 (owner: Claude, decisions: Ray)

Ray's staged gate before the system may place a real, unsupervised automated call to Pops:

- **Stage 0 (safe state) — DONE.** `dailyCallEnabled` was found **TRUE** at ~10:52 UTC (flipped during a prior session, never flipped back). Set to **FALSE** at ~10:55 UTC, ~6h before the 10:00 PT fire time. Verified no call has *ever* fired: zero `daily_call` rows in `cron_job_log`, no `daily_call_last_triggered_date` key. The deployed autoscale app shares the workspace `DATABASE_URL` (proven by cron rows written while no local server ran) and the scheduler re-reads settings inside every job run, so the flip governs the live deployment immediately.
- **Stage 1 (redirect target) — DONE.** `pops_phone_number` confirmed at Ray's own phone `+19097324902` — and notably it had **already** held that value since 2026-07-26 (the day of all 17 test sessions). So even while the flag was TRUE, calls would have gone to Ray. **Pops' real number is not stored anywhere in the system** — Ray must enter it at Stage 4. The number is read by a fresh DB SELECT on *every* call attempt (`routes/jessica.ts` `getPopsPhonenumber`), no caching; `ADMIN_PHONE_NUMBER` (the `test:true` path) holds the same Ray number.
- **Stages 2–5 (exercise all 8 jobs → break-tests → one supervised real call → enable)** — pending; an 11-area read-only code audit ran Aug 6 (findings + supervised test plan being compiled). Known already: cron "Run Now" (`force`) bypasses the master switch, time gate, and daily claim but **never** the quiet window; the manual `POST /jessica/outbound-call` route checks **neither** quiet window nor master switch; autoscale sleep at 10:00 PT is a live-fire blocker (see open item 3).

## Open items (owner: Ray unless noted)
1. **Flip `dailyCallEnabled`** — now gated behind the Day-1 readiness stages above (Stage 5, Ray only). The UI for it exists as of Aug 6 (`/settings` → Jessica). ⚠️ The flag was found unexpectedly TRUE on Aug 6 morning — flipped in a prior session and not flipped back; now FALSE. How it got flipped without a working UI at the time is unexplained — treat any future unexplained TRUE as an incident.
2. ~~Republish the deployment~~ — **DONE Aug 6** (Ray republished twice more after the settings consolidation; HEAD `6c94a4c`).
3. **Switch deployment Autoscale → Reserved VM** — `.replit` still says `deploymentTarget = "autoscale"`. An autoscale app sleeps and cannot fire the 10:00 call (cron-log gaps confirm multi-hour sleeps). Blocks Stage 5 from actually working.
4. ~~Rotation-task completions wiped by daily reset~~ — **FIXED Aug 6** (`43f0c4f`): late catch-up resets no longer wipe same-day completions; save failures surface in the UI.
5. ~~Knowledgebase 194-of-204 file count~~ — **explained Aug 6.** The 194 was 173 duplicate source files plus 21 real docs; the 173 are now deleted and all 21 docs verified present. Nothing further to chase unless the Mac shows docs that aren't on GitHub.
6. Open PR #2 (ElevenLabs webhook signature verification) from Jul 21 — real security work, unmerged. The webhook is public and unauthenticated; a forged POST could set `reached=true`/inject transcripts. Should be resolved before Stage 5.

## Known gotchas for reviewers
- Replit env refreshes can wipe git's credential helper → auto-push fails loudly. Fix: `gh auth setup-git`, push, delete the alert file. (Recurred Aug 6 10:03 UTC — 3 commits stranded; fixed same morning with exactly that recipe.)
- The workflow panel can show FAILED while a manually-started server is healthy on 8080 — check the port, not the panel.
- One commit titled "Simulated Replit Agent commit" was authored by Claude Code to test the auto-push hook — labeled deliberately; git author identity is a label, not proof.
