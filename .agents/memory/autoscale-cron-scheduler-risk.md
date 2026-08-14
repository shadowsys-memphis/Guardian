---
name: Autoscale deployment vs in-process cron scheduler
description: Production ran on Replit autoscale (scales to zero when idle) but safety-critical jobs (daily call, med/appointment alerts) run on an in-process setInterval scheduler that needs the process continuously alive.
---

`api-server`'s cron scheduler (`call-scheduler.ts`, `startCronScheduler()`) is a single in-process `setInterval` tick loop, not an external Replit Scheduled Deployment. It drives daily_call, appointment_reminder, haldol_alert, med_refusal_escalation, wellbeing_escalation, missed_call_detection, elevenlabs_config_check, quarter_auto_advance — i.e. the actual safety-critical automation, including Jessica's outbound daily wellness call to Pops.

Production deployment type was `autoscale` (confirmed via `getDeploymentInfo()` and `.replit`'s `[deployment].deploymentTarget`). Per Replit's own docs, autoscale scales to zero when idle and is explicitly not intended for continuous background jobs — only an incoming HTTP request wakes it. If nothing hits the app around a scheduled trigger time, the tick loop simply never runs and nothing gets logged, since no process is alive to log a failure.

**Why:** this app's core value prop (Jessica calls Pops on schedule; safety alerts fire reliably) silently depends on assumptions the deployment type doesn't guarantee. The scheduler code itself is well-designed for brief restarts (widened time-of-day windows, immediate tick on boot) but that only forgives short gaps, not a full scale-to-zero for hours with zero incidental traffic.

**How to apply:** On 2026-08-14, Ray chose to switch production to a Reserved VM (always-on) to close this gap — **verify in a later session whether that switch actually happened** (check `getDeploymentInfo().deploymentType === "vm"`), since it could not be done programmatically. There is no callback to change an existing deployment's target — it's a manual step: Publishing tool → Adjust settings → "Deployment type" dropdown (may require unpublishing first if greyed out). Don't waste time hunting for a `deployConfig()`-style callback; it isn't exposed to this agent.
