---
name: Two overlapping Pops task/routine tables
description: schedule_tasks vs rotation_tasks both model Pops' daily routine — don't assume there's just one
---

Brain Guardian OS has two separate, overlapping data models for Pops' daily routine/tasks:
- `schedule_tasks` — tenant-scoped, quarter-based (Q1-Q4), has a `voice_script` per task. This is what Pops' passive display shows, what Jessica's call-context reads from, and what the Admin dashboard's Schedule Editor does full CRUD on.
- `rotation_tasks` — not tenant-scoped, powers a separate "Rotation" dashboard, local-session-only. Some rows are medication-labeled but this is not the medications table.

**Why:** This duplication is a likely root cause of user reports that the schedule/task setup feels repeatedly broken or needs to be "rebuilt" — work landing in one table doesn't show up in the other, and it's easy to assume there's a single task list when there are two.

**How to apply:** When investigating or changing anything about Pops' tasks/routine, check both tables, not just the one that first turns up. Do not merge, migrate, or deprecate either table without the user's explicit go-ahead — both may hold live, currently-relied-on data.
