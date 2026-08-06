# LOCKED SPEC — Settings consolidation

**Builder:** Open Claw. **Architect/Inspector:** Claude Code (Replit).
Build exactly this. Do not redesign, do not "improve" adjacent code, do not touch files not listed.
If anything here does not match what you find in the code, **stop and report the mismatch** — do not guess.

---

## Goal

Settings was half-migrated out of the Admin dashboard into the standalone `/settings` page, and the old in-Admin tab was never removed. `AppSettingsTab` in `admin-view.tsx` is **unreachable dead code** — `setActiveTab("settings")` is called nowhere, and Admin's Settings sidebar button navigates to `/settings` instead.

Two things are stranded inside that dead tab with no reachable UI anywhere in the app:
1. The **daily call on/off toggle and call time** (`dailyCallEnabled`, `dailyCallTime`)
2. **`SystemJobsPanel`** — the cron job monitor

Done = both live on `/settings`, and the dead tab is gone.

---

## Files touched — exactly three

### 1. NEW FILE: `artifacts/brain-app/src/components/system-jobs-panel.tsx`

Move these four declarations out of `artifacts/brain-app/src/pages/admin-view.tsx` **verbatim** (no logic changes):

- `type CronJobStatus = {...}` (currently ~line 4638)
- `type CronStatus = {...}` (~4646)
- `function outcomeGlyph(...)` (~4657)
- `export function SystemJobsPanel() {...}` (~4665, ends just before `function DocumentsTab`)

Add to the new file whatever imports those four need. Known requirements:
- `react`: `useState`, `useEffect`
- `lucide-react`: `AlertTriangle`, `CheckCircle`, `ChevronDown`, `ChevronUp`, `Clock`, `RefreshCw`, `ShieldAlert`
- `@/components/ui/card`: `Card`, `CardContent`, `CardHeader`, `CardTitle` (include `CardDescription` only if used)
- `@/components/ui/button`: `Button`
- `@/hooks/use-toast`: `useToast`
- `const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");` — copy this line; it is used for the `/api/cron/...` fetches

Verify against the actual body; add anything else it references. Keep `SystemJobsPanel` exported.

### 2. `artifacts/brain-app/src/pages/admin-view.tsx` — deletions only

- Delete the whole `function AppSettingsTab() {...}` declaration (~4433 through just before `type CronJobStatus`).
- Delete the four declarations moved to the new file in step 1.
- Line 117: remove `"settings"` from the `Tab` union. Leave every other member.
- Line 177: delete `{activeTab === "settings" && <AppSettingsTab />}`.
- **KEEP line 153 unchanged** — `<NavButton active={false} onClick={() => navigate("/settings")} ... label="Settings" />` is correct behavior.
- Remove imports that are now unused **only if the typecheck flags them**. Do not prune imports speculatively — other tabs share them.

### 3. `artifacts/brain-app/src/pages/settings-view.tsx` — additions

**3a. Daily Call card → the Jessica tab.**

`JessicaTab()` already exists (~line 260) and is titled "Jessica Calling / Pops' phone number and ElevenLabs outbound call configuration" — the Daily Call card belongs there, appended after the existing phone-number card.

Port the Daily Call card from the deleted `AppSettingsTab`. Required behavior, unchanged from the original:

```tsx
const { data: healthSettings } = useGetAssessmentSettings();
const updateHealthSettings = useUpdateAssessmentSettings();
const [callForm, setCallForm] = useState({ dailyCallEnabled: false, dailyCallTime: "10:00" });

useEffect(() => {
  if (healthSettings) {
    setCallForm({
      dailyCallEnabled: (healthSettings as any).dailyCallEnabled ?? false,
      dailyCallTime: (healthSettings as any).dailyCallTime ?? "10:00",
    });
  }
}, [healthSettings]);

const handleCallToggle = (dailyCallEnabled: boolean) => {
  const next = { ...callForm, dailyCallEnabled };
  setCallForm(next);
  updateHealthSettings.mutate({ data: next }, {
    onSuccess: () => toast({ title: dailyCallEnabled ? "Daily call enabled" : "Daily call disabled" }),
    onError: () => toast({ title: "Failed to save — daily call unchanged", variant: "destructive" }),
  });
};

const handleCallTimeSave = (e: React.FormEvent) => {
  e.preventDefault();
  updateHealthSettings.mutate({ data: callForm }, {
    onSuccess: () => toast({ title: "Daily call time saved" }),
    onError: () => toast({ title: "Failed to save call time", variant: "destructive" }),
  });
};
```

Card UI: a `Switch` bound to `callForm.dailyCallEnabled` → `handleCallToggle`, and a form with `<Input type="time" min="06:00" max="20:00">` bound to `callForm.dailyCallTime` → `handleCallTimeSave`. Label text reads "Automatic daily call is on/off". Helper text: "Must be between 6:00 AM and 8:00 PM."

New imports needed: `Switch` from `@/components/ui/switch`, and `useGetAssessmentSettings` / `useUpdateAssessmentSettings` (**already imported at the top of this file** — do not duplicate).

The `onError` handlers above are **required**, not optional — a silently failed write here means Ray believes the daily call is on when it is not.

**3b. New "System" tab hosting the jobs panel.**

- `type SettingsTab` (~line 44): add `| "system"`.
- `TABS` array (~1163): append `{ id: "system", label: "System", icon: <Activity size={16} /> }` (import `Activity` from lucide-react).
- `tabTitle`: `system: "System Jobs"`.
- `tabDesc`: `system: "Scheduled background jobs and their recent run history."`
- Add the render branch alongside the other tabs: `{tab === "system" && <SystemJobsPanel />}` — match however the existing tabs are rendered in this file.
- Import `SystemJobsPanel` from `@/components/system-jobs-panel`.

---

## Edge cases

1. `SystemJobsPanel` must keep working after the move — it fetches `${WORKSPACE_BASE}/api/cron/status`. If you drop `WORKSPACE_BASE` the URL silently becomes relative and breaks under a non-root base path.
2. `healthSettings` is `undefined` on first render. The `useEffect` guard above handles it — keep it. Never let the toggle render `checked={undefined}`.
3. `updateHealthSettings.mutate` sends the **whole** `callForm` object. Do not send a partial patch of just one field, or you will blank the other.
4. Deleting `AppSettingsTab` also deletes the only other copy of the Store Preferences and Quiet Window cards. **That is intended** — both already exist on `/settings` (Store tab and General tab). Do not port them; verify they exist before deleting.
5. Do not narrow the `Tab` union in a way that breaks the other 13 members.

---

## Acceptance criteria (how the Inspector judges the diff)

1. `pnpm run typecheck` passes from the repo root. Not from a sub-package.
2. `grep -rn "AppSettingsTab" artifacts/brain-app/src/` returns **nothing**.
3. `grep -rn "dailyCallEnabled" artifacts/brain-app/src/pages/settings-view.tsx` returns matches.
4. `grep -rn "SystemJobsPanel" artifacts/brain-app/src/` shows it defined in `components/system-jobs-panel.tsx` and imported by `settings-view.tsx` only.
5. `"settings"` is gone from the `Tab` union in `admin-view.tsx`; all other members intact.
6. `SystemJobsPanel`'s logic is byte-identical to the original apart from imports.
7. Exactly three files changed (one added, two modified). No others.

---

## Explicitly OUT OF SCOPE

- Any backend file. No changes under `artifacts/api-server/`.
- `lib/api-spec/openapi.yaml` and anything generated from it.
- Any file under `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` — **never hand-edited** (AGENTS.md rule 8).
- Redesigning the Settings page layout, restyling, or "cleaning up" other tabs.
- The vault gate, session auth, tenant scoping, CORS.
- The rotation tab (separate work, already done).

---

## Non-negotiables that apply (AGENTS.md)

- **Rule 3 — no broad rewrites.** Targeted changes only, exactly as scoped above.
- **Rule 8 — generated files are never hand-edited.**
- **Rule 11 — destructive operations require an approved plan.** The deletions listed here *are* that approved plan. Deleting anything beyond them is not approved.
- **Rule 1 — one active writer at a time.** Confirm with Ray that no other agent is mid-edit before you start.

## HARD SAFETY RULE

**Do not enable the daily call.** You are building the switch, not flipping it. `dailyCallEnabled` is `false` in the database and must stay `false` — that flag places real automated phone calls to Ray's father, and turning it on is his decision alone. Do not run any script, query, or request that changes it. Do not seed a `true` default anywhere. The `useState` initial value stays `false` and is immediately overwritten by the server's value.
