---
type: system-map
last_updated: 2026-06-22
status: operational
owner: Guardian.OS Architect
---

# System Map

## Overview
ClawX is a React 19 + Electron wrapper that serves as the desktop GUI client. It controls the underlying OpenClaw runtime, orchestrating agent execution, local tool execution, and local model providers.

```mermaid
graph TD
    ClawX[ClawX Electron GUI] <-->|IPC / WS| OC_Gateway[OpenClaw Gateway]
    OC_Gateway <-->|Local Processes| Agents[OpenClaw Agents]
    Agents <-->|Local API Port 1234| LM_Studio[LM Studio Provider]
    Agents <-->|External Channels| Telegram[Telegram Bot Client]
```

## Key System Paths
* **Code Repository**: [ClawX-main](file:///Users/memphis/Desktop/ClawX-main)
* **ClawX UI Application Data**: [clawx Application Support](file:///Users/memphis/Library/Application%20Support/clawx)
* **OpenClaw Config & Memory**: [openclaw Config](file:///Users/memphis/.openclaw)
