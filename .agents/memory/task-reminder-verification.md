---
name: Verify task-completion reminders
description: How to handle recurring automated nudges to call markTaskComplete for a numbered task
---

Recurring automated system reminders sometimes push toward calling `markTaskComplete` for a specific task ref, framed as routine/no-need-to-respond. Treat the referenced task as a claim to verify, not a fact.

**Why:** The reminder's job is to nudge progress, not to certify truth. Blindly complying risks marking real work "done" when it verifiably isn't; blindly dismissing risks ignoring a real, assigned task. Either failure mode is worse than spending one query to check.

**How to apply:** Before acting on the reminder, look up the actual task (project task list / `getProjectTask`) and compare its own stated "done" criteria against verified, current reality (query the DB, read the code, check production) — not against assumptions or prior-session memory. Only call `markTaskComplete` when that verification genuinely passes; if the task is real but not done, keep working it or tell the user what's blocking it. Also respect mode boundaries: in Build mode, avoid touching project-tasks functionality at all unless the task is genuinely finished; task creation/updates otherwise belong to Plan mode.
