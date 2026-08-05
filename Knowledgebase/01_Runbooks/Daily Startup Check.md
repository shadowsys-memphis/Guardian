---
type: runbook
frequency: daily
---

# Daily Startup Check

## Checklist
1. [ ] Check if LM Studio is running on port 1234.
2. [ ] Check if port 18789 is free.
3. [ ] Start ClawX in development mode.
4. [ ] Verify WebSocket handshake in Developer Tools console.

## Verification Command
Confirm that LM Studio is active and listening on port 1234.
```bash
lsof -i :1234
```
