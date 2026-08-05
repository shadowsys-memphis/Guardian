---
type: security-policy
severity: critical
---

# DO NOT TOUCH Policy

This document defines boundaries that external AI agents must respect.

## Protected Paths
* **`~/.openclaw/credentials/`**: Do not read, write, or transmit contents.
* **OS Keychain**: Never query using shell commands.

## Restricted Actions
* **Submodule modification**: Do not pull, branch, or modify code inside `CareGiving/Guardian-OS` without explicit human confirmation.
