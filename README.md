# Guardian — the br(AI)n App

An AI caregiving system built by Ray (Raymo) for his father **Pops**, a veteran living
with PTSD and schizophrenia. **Jessica** is the AI companion at its center: she calls
Pops on the phone, walks him through his day, checks on his health and medication, and
reports everything back to Ray's dashboard.

This is a personal care system first. It runs Ray's household. Treat every change like
someone's father depends on it — because he does.

---

## What it does

- **Daily phone calls.** Jessica calls Pops (via ElevenLabs + Twilio), talks like a
  friend, and weaves in health check-ins — sleep, meds, meals, mood, hydration.
- **A structured day.** Pops' schedule runs in four quarters, defined by Ray:
  - **Q1 Morning (6–10):** 7:00 wake-up call → make bed → pick up room → walk Koda
    (the dog) → shower → breakfast → hydration check-in → free time
  - **Q2 Midday (10–2):** chores → wind-down → noon meds → lunch → hydration check-in
  - **Q3 Fun block (2–6):** activity of his choice → light health check-in → wind-down
  - **Q4 Wind-down (6–bed):** evening meds → dinner → dishes → mail → journal →
    sleep check-in → lights out by 9:30
- **Priority tiers.** Every task has a level (safety > medication > meals/hydration >
  sleep > hygiene/Koda > routine). A missed pill escalates to Ray; a skipped chore just
  closes out. Refusing, not answering, and missing are tracked as different things.
- **Day types.** Each morning resolves to Normal, Sunday, Rest, Appointment, or Sick.
  Jessica may *suggest* a Rest day; only Ray can declare one.
- **Voice actions.** On a call, Jessica can add/move/remove schedule tasks and mark
  them done or declined — but "done" only ever comes from a live spoken confirmation.
- **Admin dashboard.** Ray sees the schedule, call history and transcripts, symptom
  logs, health data, alerts, grocery/meal planning, and system job status.

## The safety rule

**The automated daily call to Pops is OFF** and stays off until Ray has run the full
day against his own phone with zero issues and explicitly turns it on. Test calls go to
Ray's number only. No AI assistant, script, or deploy may flip `dailyCallEnabled` on
its own.

## Current status

See **[STATUS.md](STATUS.md)** — the single plain-English source of truth for what
works, what's next, and what's parked. Start there.

## Stack

pnpm monorepo on Replit (NixOS — no Docker, no virtualenvs):

| Piece | Where | What |
|---|---|---|
| API server | `artifacts/api-server/` | Express 5, bundled with esbuild |
| Frontend | `artifacts/brain-app/` | React 19 + Vite 7 (admin dashboard, Pops view, Jessica phone UI) |
| API contract | `lib/api-spec/openapi.yaml` | Source of truth; Orval generates the React Query client + Zod schemas |
| Database | `lib/db/` | Drizzle ORM + PostgreSQL |
| AI | Gemini (chat + prompts), ElevenLabs + Twilio (real phone calls) | |

## Running it

```bash
pnpm run typecheck                              # always from repo root
pnpm --filter @workspace/api-spec run codegen   # after editing openapi.yaml
pnpm --filter @workspace/api-server run dev     # API (build + run)
pnpm --filter @workspace/brain-app run dev      # frontend
```

Required secrets: `SESSION_SECRET`, `VAULT_PASSPHRASE`, `DATABASE_URL`,
`ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` / `ELEVENLABS_PHONE_NUMBER_ID`,
`ELEVENLABS_WEBHOOK_SECRET`, `ADMIN_PHONE_NUMBER`, `VITE_PUBLIC_SITE_URL`, and the
Replit-injected Gemini vars. No Stripe — billing was removed.

## For AI assistants working in this repo

Read `CLAUDE.md` and `.claude/CLAUDE.md` before changing anything. Key rules:

- Care-plan *content* (times, tasks, escalation) comes from Ray — ask, don't invent.
- Never enable the daily call, never ring any phone, without Ray's explicit go.
- Never stop or restart running processes without Ray's OK.
- `hermes.ts` is an internal event dispatcher an AI named in July 2026. It is **not**
  Ray's separate external Hermes system — no connection whatsoever.
- If a deploy/publish screen offers to delete a database table: cancel and investigate.
  Several tables are created by raw SQL at runtime and live outside the Drizzle schema.
