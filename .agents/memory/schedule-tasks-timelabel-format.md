---
name: schedule_tasks.timeLabel storage format
description: timeLabel is always raw 24-hour "HHMM" with no colon and no AM/PM — a plausible-looking "3:00 PM" string is a real bug, not a style choice.
---

`schedule_tasks.timeLabel` is stored as a raw 4-digit 24-hour string with no separator — `"0600"`, `"1500"`, `"1900"` — never `"15:00"` and never a 12-hour/AM-PM string. This convention is used consistently by seed data, the Admin dashboard's task list, Pops' kiosk display (shown verbatim, e.g. "AT 0600"), and the calendar export. Any code that writes to this column must strip formatting down to bare HHMM before persisting — reserve human-friendly formatting ("3:00 PM") strictly for display/speech, never for storage.

**Why this matters:** it's easy to assume the friendlier display format is what's stored, since nothing in the type system enforces the 4-digit-no-colon shape (it's a plain string column). That assumption produced a real bug once (a new write path persisted `"3:00 PM"`-style strings instead of `"1500"`), silently breaking sort order and display everywhere else that reads the column verbatim.

**Unrelated, don't confuse:** `assessment_settings.dailyCallTime` (governs when Jessica's daily call goes out) genuinely IS colon-separated `"HH:MM"` — a completely different column with a completely different, also-correct, convention. Check which column you're touching before assuming either format.
