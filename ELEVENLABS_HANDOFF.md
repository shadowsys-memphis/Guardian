# ElevenLabs → Guardian phone call (do this in Replit)

Goal: first real outbound call. Code is already in Guardian (`jessica.ts`).

## Secrets to set in Replit → Tools → Secrets

| Key | Value |
|---|---|
| `ELEVENLABS_API_KEY` | (your key from elevenlabs.io/app/settings/api-keys) |
| `ELEVENLABS_AGENT_ID` | `agent_2501kc0yrbcbek8ab31xvtakhpeq` |
| `ELEVENLABS_PHONE_NUMBER_ID` | ElevenLabs → Deploy → Phone Numbers → copy the **ID** of the imported Twilio number (not the 844 digits) |

After saving Secrets: **restart** the Replit app/workflow.

## In the Guardian app

1. Unlock vault
2. Settings → Jessica → save **your** test number as `+1XXXXXXXXXX`
3. Jessica → Connect

## Notes

- Agent display name is **Huey**; Jessica is a branch. Use the Agent ID above.
- Toll-free 844 may need Twilio verification before carriers allow outbound.
- Cursor SSH cannot write Replit Secrets. Replit Agent can if you paste values and allow Secrets access.

Paste this file to Replit Agent and say: set these three secrets and restart.
