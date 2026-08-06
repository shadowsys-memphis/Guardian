# Guardian — Team Handoff & Ground Truth
**Updated: 2026-08-06 (post-restart). Maintained by Claude Code in Replit. If you are an AI agent reading this, treat it as the current state of the project and verify against live systems before contradicting it.**

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
- **Haldol is MONTHLY: every 28 days.** Last shot **2026-08-06**, next due **2026-09-03**. Dose was halved at Dr Uddin visit 2026-07-28 (exact mg pending After Visit Summary).
- Every hardcoded 14-day/biweekly reference was purged Aug 6 (defaults, Jessica's prompt, AI clinical summary, admin UI, calendar, schema, docs). If you find a "14-day" reference anywhere, it is a bug — report it, don't reintroduce it.
- Zombie/high-symptom window: days 1–5 post-shot (currently Aug 6–10) — Jessica's tone auto-softens.

## System state (verified live, post-restart Aug 6)
- API server healthy on port 8080 (`/api` prefix). Cron scheduler running with all 8 jobs.
- **Security:** `VAULT_PASSPHRASE` secret is set; the legacy "accept any passphrase" hole is CLOSED (fake passphrase → 401, verified). All pre-lock sessions revoked — every device must log in once with the new passphrase.
- **Lab tracker:** was dead (tables never created) — `lab_protocols`, `lab_phases`, `lab_draws` created Aug 6, endpoints 200.
- All feature endpoints audited live Aug 6: shopper (loaded), schedule, inventory, health-assessment, scripts, smarthome, rotation, symptoms, state, cron — all working. Appointments/medications/documents/cravings wired but empty (unused, not broken).
- Both call-placing cron jobs (`daily_call`, `appointment_reminder`) now gate on the single master switch `dailyCallEnabled` (fixed Aug 6 — reminder job was previously ungated).

## Open items (owner: Ray unless noted)
1. **Flip `dailyCallEnabled`** (app_settings → assessment_settings). Claude is deliberately blocked from doing this. Once true: daily call 10:00 PT, appointment reminders 20:00–22:00 PT, quiet window 22:00–07:00.
2. **Republish the deployment** — the public app still runs old code AND the old open-door auth.
3. **Switch deployment Autoscale → Reserved VM** — an autoscale app sleeps and cannot fire the 10:00 call.
4. Rotation-task completions don't persist (17 rows pending since Jun 29) — known bug, next code task (owner: Claude).
5. Knowledgebase: 194 of 204 files on GitHub; ~10 skipped by .gitignore on the Mac (likely junk — verify with `git ls-files --others --ignored --exclude-standard -- Knowledgebase/` there).
6. Open PR #2 (ElevenLabs webhook signature verification) from Jul 21 — real security work, unmerged.

## Known gotchas for reviewers
- Replit env refreshes can wipe git's credential helper → auto-push fails loudly. Fix: `gh auth setup-git`, push, delete the alert file.
- The workflow panel can show FAILED while a manually-started server is healthy on 8080 — check the port, not the panel.
- One commit titled "Simulated Replit Agent commit" was authored by Claude Code to test the auto-push hook — labeled deliberately; git author identity is a label, not proof.
