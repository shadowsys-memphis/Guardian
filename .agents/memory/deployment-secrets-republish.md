---
name: Deployment secrets need republish
description: Replit deployments snapshot Secrets at publish time; a live/production deployment does not pick up a changed Secret until redeployed.
---

Editing a value in the Secrets pane takes effect immediately for the dev workspace (once the workflow restarts and re-reads `process.env`), but a live/published deployment keeps running with whatever secret values were current at its last publish. It does not live-refresh, confirmed via Replit's own docs (searchReplitDocs).

**Why:** A real incident: `ELEVENLABS_PHONE_NUMBER_ID` was corrected and verified working in dev (restart + live API cross-check), but production would have silently kept placing real calls with the old broken value — no error, no log signal — until republished. A lenient internal validator (treats either a phone number or its ID as "ok") made this even harder to catch from logs alone; had to verify the actual stored value against ElevenLabs' live API directly, not just trust our own health check's "ok".

**How to apply:** Whenever a secret or env var fix matters for something already deployed (not just a dev-only concern), explicitly tell the user the fix is incomplete until they republish — don't imply "done" from dev verification alone. Use `getDeploymentInfo()` to confirm a deployment exists first, then `SuggestUserAction({ action: "deploy" })` with a message naming the specific reason.
