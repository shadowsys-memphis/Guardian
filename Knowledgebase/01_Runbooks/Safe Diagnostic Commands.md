---
type: reference
category: diagnostics
safe_level: read-only
---

# Safe Diagnostic Commands

Use these commands to diagnose issues without modifying system state or code.

## Network Port Status
List all active listeners on local network interfaces.
```bash
netstat -anvp tcp | grep LISTEN
```

## OpenClaw Port Binding
Check if a process is listening on the default OpenClaw Gateway port (18789).
```bash
lsof -i :18789
```

## Disk Space Usage
Verify available disk space on the primary volume.
```bash
df -h /
```

## OpenClaw Configuration Health
Test if the JSON configuration file is syntactically valid.
```bash
plutil -lint ~/.openclaw/openclaw.json
```
