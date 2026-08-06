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

## `Knowledgebase/artifacts/` — RESOLVED and deleted Aug 6

The docs vault used to contain a stale snapshot of all three artifact source folders under the **same package names** (`@workspace/api-server`, etc.). It triggered a false alarm that two cron schedulers were running and would call Pops twice. **That alarm was wrong** — nothing was ever running from it. Verified at the time: `.replit` registered only the real `artifacts/*` paths, `pnpm -r list` resolved to the real paths, the copies had no `node_modules` so could not start, one server process was running, and `cron_job_log` had **zero** duplicate rows in 3 days.

The copies were then deleted (173 files, in commit `d39cbca`). Post-deletion state verified: **21 doc files remain, 0 under `artifacts/`.** All docs folders intact — `00_System_Map`, `01_Runbooks`, `02_Registry`, `03_Agents`, `04_Models`, `06_Incidents`, `07_Prompts`, `08_Decisions`, `12_LM_Studio`, `13_Security_and_Boundaries`, `Bldr Notes`. (This also explains the old "194 of 204 files" note — 194 = 173 duplicate source files + 21 real docs.)

**Deleting them was correct, and one file made it urgent.** `haldolService.ts` in the snapshot contained `const cycleDay = diffDays % 14` with a doc comment reading "a repeating 14-day cycle" — the exact hardcoded biweekly logic purged everywhere else, superseded by `lib/haldol-cycle.ts` reading the prescriber-set `interval_days` (28). Pops is on a **28-day** cycle. Had anything reused that file it would have reported the wrong cycle day and a phantom injection day every 14 days. Nothing is lost — full history is in git (removal commits `61c5421`, `98a0acd`, `62f16ac`).

## Settings is a half-finished migration — and it's why item 1 never happened (found Aug 6)

Settings was moved out of the Admin dashboard into a standalone `/settings` page, but the old in-Admin tab was never deleted. `AppSettingsTab` (`admin-view.tsx`) is **unreachable dead code** — `setActiveTab("settings")` is called nowhere; Admin's "Settings" sidebar button navigates away to `/settings` instead. Two things are stranded inside it with **no other UI anywhere in the app**:

1. **The daily call on/off toggle and call time** — `dailyCallEnabled` appears in exactly one frontend file, and only inside the dead tab. There is no reachable button for it.
2. **`SystemJobsPanel`** — the cron job monitor. Exported, but its only usage is inside the dead tab, so it is unreachable too.

Store preferences and the quiet window *did* make it to the new page, so those are duplicated rather than lost.

**Fix (not yet done, owner: Claude):** move the daily call controls and `SystemJobsPanel` into `/settings` (the Jessica tab is the natural home for call behavior), then delete the dead `AppSettingsTab` and the `"settings"` member of the `Tab` union.

## Open items (owner: Ray unless noted)
1. **Flip `dailyCallEnabled`** (app_settings → assessment_settings). Claude is deliberately blocked from doing this. Verified still `false` on Aug 6 — **no copy of the app can place a call to Pops until Ray flips it.** Once true: daily call 10:00 PT, appointment reminders 20:00–22:00 PT, quiet window 22:00–07:00.
   **Blocked on a bug, not on Ray.** Older notes said "Ray flips it via the admin UI" — that UI is unreachable (see the Settings section above). Until the settings consolidation lands, the only way to flip it is directly in the DB. That is why this item has sat open.
2. ~~Republish the deployment~~ — **DONE Aug 6** (Ray republished; HEAD is `1e08e4c "Published your App"`).
3. **Switch deployment Autoscale → Reserved VM** — `.replit` still says `deploymentTarget = "autoscale"`. An autoscale app sleeps and cannot fire the 10:00 call. Blocks item 1 from actually working.
4. Rotation-task completions don't persist (17 rows pending since Jun 29) — known bug, next code task (owner: Claude).
5. ~~Knowledgebase 194-of-204 file count~~ — **explained Aug 6.** The 194 was 173 duplicate source files plus 21 real docs; the 173 are now deleted and all 21 docs verified present. Nothing further to chase unless the Mac shows docs that aren't on GitHub.
6. Open PR #2 (ElevenLabs webhook signature verification) from Jul 21 — real security work, unmerged.

## Known gotchas for reviewers
- Replit env refreshes can wipe git's credential helper → auto-push fails loudly. Fix: `gh auth setup-git`, push, delete the alert file.
- The workflow panel can show FAILED while a manually-started server is healthy on 8080 — check the port, not the panel.
- One commit titled "Simulated Replit Agent commit" was authored by Claude Code to test the auto-push hook — labeled deliberately; git author identity is a label, not proof.
