# Start Guardian (local)

You only need two commands after clone.

```bash
cd /Users/memphis/CareGiving_Local/BrainGuard
cp .env.example .env
# paste Gemini key into AI_INTEGRATIONS_GEMINI_API_KEY
pnpm setup
pnpm dev
```

Then open **http://localhost:5173**

| What | URL |
|------|-----|
| Unlock / app | http://localhost:5173 |
| Schedule (Admin) | http://localhost:5173/admin |
| Jessica | http://localhost:5173/jessica |
| Pops display | http://localhost:5173/pops |

## What `pnpm setup` does
1. Creates `.env` if missing  
2. Uses the Postgres `DATABASE_URL` points at — starts Docker only if nothing answers there  
3. `pnpm install`  
4. Pushes DB schema  

## What `pnpm dev` does
Starts API (`:8080`) + app (`:5173`) with `/api` proxied automatically.

## Requirements
- A Postgres: native (point `DATABASE_URL` at it) **or** Docker Desktop (auto-fallback)  
- pnpm (`npm i -g pnpm`)  
- Gemini API key → https://aistudio.google.com/apikey  

## Soul loop live test
1. `/admin` — add/edit today’s schedule tasks  
2. `/jessica` → phone — start a call; Jessica should see the schedule  
3. `/pops` — confirm ambient display updates  

Stop with **Ctrl+C**.
