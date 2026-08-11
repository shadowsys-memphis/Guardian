---
name: Channel-specific action parsing must be extended per-channel
description: Jessica has separate text-chat and phone-call transcript parsers with different feature coverage — a new Hermes action type isn't automatically usable everywhere it's dispatched from.
---

# Channel-specific action parsing must be extended per-channel

## Rule
Jessica's text-chat path and phone-call path each parse the LLM's output differently: text-chat scans for a trailing `---ACTION---` block; the phone-call webhook handler only scans the transcript for `<health_data>`/`<craving>` tags. Adding a new `HermesActionType` (or any new Hermes-dispatched behavior) does not automatically make it usable on every channel that calls `dispatch()` — each channel's parsing/triggering surface must be explicitly checked and extended, or the new action silently never fires on the channel nobody updated (no error, no crash — just a spoken or written confirmation with nothing behind it).

**Why:** the channels evolved independently with no shared "does this text produce an action" contract, and nothing enforces parity between them. A silently-inert action is easy to miss in testing because the conversation still completes normally.

**How to apply:** before assuming a Hermes action "just works," confirm the specific channel you care about actually triggers it — via (a) the text-chat ACTION-block scanner, (b) the phone-call transcript tag scanner, or (c) a dedicated ElevenLabs webhook tool (the pattern used for real-time task/schedule voice actions, which bypasses transcript parsing entirely). Having a `dispatch()` case for an action type is not evidence it's reachable from where you need it.

## Known current gap
Every legacy ACTION-block action type other than task/schedule (which now has dedicated webhook tools) — e.g. smart device toggle, grocery ordering — is still inert specifically on phone calls, since the phone webhook handler never gained ACTION-block parsing.
