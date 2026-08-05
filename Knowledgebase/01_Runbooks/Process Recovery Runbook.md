---
type: runbook
id: RB-001
system: process-lifecycle
last_tested: 2026-06-22
---

# Process Recovery Runbook

Follow these steps if ClawX locks up, crashes, or leaks CPU.

## Step 1: Detect Runaway Processes
Check if the Electron process is consuming excessive CPU resources.
```bash
ps aux | grep -i -E 'electron|claw|gateway'
```

## Step 2: Safe Soft Termination
Send a standard termination signal to allow the process to flush logs to disk.
```bash
kill <PID>
```

## Step 3: Hard Termination (If Unresponsive)
If the process is unresponsive after 5 seconds, force terminate it immediately.
```bash
kill -9 <PID>
```

## Step 4: Truncate Logs
Clear bloated logs to reclaim disk space after a crash.
```bash
true > ~/Library/Application\ Support/clawx/logs/clawx-*.log
```
