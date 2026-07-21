# Guardian.OS Consolidation - Phase 1: Data & AI Ownership

## 1. Data Ownership (Moving away from Firebase)
You are 100% right to want off Firebase. Relying on a third-party cloud database for critical caregiving data is a risk if they deprecate services, change pricing, or dissolve. 

**The Guardian.OS solution:** We are replacing Firebase with **PostgreSQL** using Drizzle ORM. 
- Your data will live in a standard relational database.
- You can export it, back it up locally, or host it on your own hardware (e.g., a Raspberry Pi or local server) at any time.
- It is *your* data, fully sovereign.

## 2. Local AI Independence (LM Studio / Local LLMs)
While we use Gemini right now for speed, reasoning quality, and ease of prototyping in this environment, the Guardian.OS architecture is designed to be **LLM-agnostic**.

**The Strategy:**
- We will build the AI integration using standard OpenAI-compatible wrappers. 
- You can easily change the `BASE_URL` in the environment variables to point to your local **LM Studio** endpoint (e.g., `http://127.0.0.1:1234/v1`).
- When local models become faster and more reliable for your hardware, you can instantly flip the switch and take the entire "Jessica" and "Governor" brain offline.

---

## 3. Data Model Mapping (Firebase -> PostgreSQL)

Here is the blueprint for how we map the unstructured Firebase/JSON data into strict, typed PostgreSQL tables in Guardian.OS.

### A. Core Cycle & State
- **Br[AI]n (Legacy):** `pops/cycle` (Firestore), `pops-state.json`
- **Guardian.OS (Postgres):** 
  - `haldol_cycle` (id, last_injection_date, next_injection_date, current_phase)
  - `app_state` (id, key, value, last_updated)

### B. Schedules & Tasks
- **Br[AI]n (Legacy):** `schedule.js` quarters, rest_day_tasks
- **Guardian.OS (Postgres):** 
  - `schedule_tasks` (id, time_span, title, description, effort_level, is_required)
  - `task_completions` (id, task_id, completed_at, cycle_day)

### C. NEW: Alarms & Call Scheduler
- **Guardian.OS (Postgres):**
  - `alarms` (id, type, time, sound_sequence, required_during_zombie, enabled)
  - `call_schedule` (id, time, payload, override_phase, last_fired_date)

### D. NEW: Medical Journal
To replace the 5 entry types from `MedJournal.jsx`, we use a typed table:
- **Guardian.OS (Postgres):**
  - `journal_entries`
    - `id` (uuid)
    - `entry_type` (enum: 'daily_obs', 'med_change', 'va_note', 'incident', 'advocacy')
    - `cycle_day` (int, 0-13)
    - `content` (text)
    - `tags` (text[])
    - `created_at` (timestamp)

---

## 4. Cycle Math Validation

I have reviewed the `useCycleContext.jsx` math:
```javascript
const daysSince = differenceInDays(today, injection)
return daysSince >= 0 ? daysSince % 14 : 14 + (daysSince % 14)
```
This is mathematically sound and maps perfectly to the Guardian.OS `haldol` route.
- Day 0: Injection Day (Effort: 0.8)
- Days 1-5: Zombie Mode (Effort: 0.2) -> *Triggers task dimming & alarm suppression*
- Days 6-9: Moderate (Effort: 0.5)
- Days 10-13: Best Window (Effort: 1.0) -> *Ideal for active exploration*

**Status:** Phase 1 is fully mapped and architected. We are ready for backend implementation.
