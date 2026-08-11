---
title: Let Raymo expose his home LM Studio server so Jessica can use local models from the deployed app
---
# LM Studio tunnel setup guide and URL configuration in Admin

**Status:** SHIPPED — `lm_studio_url` in `app_settings`, falling back to `LM_STUDIO_URL` then `http://localhost:1234`. _(audited 2026-08-11)_

  ## What & Why
  The `LM_STUDIO_URL` env var currently requires touching deployment settings. Raymo needs to use a tunnel (ngrok, Cloudflare Tunnel, etc.) to expose his local LM Studio when accessing the deployed app. A UI field in Admin → AI Brain where he can paste the tunnel URL would let him switch without touching environment variables.

  ## Done looks like
  - Admin → AI Brain section has an editable "LM Studio URL" field saved to `app_settings`
  - API server reads the URL from settings first, falling back to `LM_STUDIO_URL` env var, then `http://localhost:1234`
  - A connection-test button pings `{url}/v1/models` and shows "Connected" or the clear error

  ## Relevant files
  - `artifacts/api-server/src/routes/gemini.ts` — `callLmStudio` function
  - `artifacts/api-server/src/routes/health-assessment.ts` — AI model settings
  - `artifacts/brain-app/src/pages/admin-view.tsx` — AiBrainSection component