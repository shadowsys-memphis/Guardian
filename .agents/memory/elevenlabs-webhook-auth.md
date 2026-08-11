---
name: ElevenLabs webhook auth pattern
description: How raw-body capture for HMAC webhook verification is wired app-wide, for anyone adding a new signed webhook route.
---

`req.rawBody` is captured globally for every request in `artifacts/api-server/src/app.ts`'s `express.json({ verify })` callback — it is not a per-route thing. `lib/webhook-auth.ts` (ElevenLabs signature check) reads that buffer rather than re-serializing `req.body`.

**Why:** `JSON.stringify(req.body)` can reorder keys or change whitespace versus what the provider actually signed on the wire, which silently breaks HMAC verification in a way that's hard to diagnose (valid-looking payload, signature always "invalid").

**How to apply:** Any new signed webhook (Stripe, etc.) added to this API server should reuse the existing `req.rawBody`, not add a second body parser or a `bodyParser.raw()` route override — the raw bytes are already available on every request.

**See also:** this HMAC pattern is for ElevenLabs' outbound post-call webhook specifically. Mid-call tool-invocation webhooks (ElevenLabs calling back into this server *during* a live conversation) use a different, simpler static-shared-secret pattern — see elevenlabs-voice-tool-calling.md.
