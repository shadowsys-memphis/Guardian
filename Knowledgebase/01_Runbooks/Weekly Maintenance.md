---
type: runbook
frequency: weekly
---

# Weekly Maintenance Runbook

## Tasks
1. [ ] Rotate/Truncate logs older than 7 days.
2. [ ] Review the `Incident Log.md` for repeating issues.
3. [ ] Run ESLint and TypeScript checks on the codebase.

## Clean Old Logs
Delete log files in the application log directory that are older than 7 days.
```bash
find ~/Library/Application\ Support/clawx/logs/ -name "*.log" -mtime +7 -delete
```
