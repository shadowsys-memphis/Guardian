import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Clock,
  Store,
  Pill,
  BrainCircuit,
  Shield,
  MapPin,
  Check,
  X,
  Plus,
  Edit2,
  Archive,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowLeft,
  Syringe,
  Settings,
  Phone,
  Activity,
} from "lucide-react";
import {
  useGetAssessmentSettings,
  useUpdateAssessmentSettings,
  useGetAiModel,
  useSetAiModel,
  getGetAiModelQueryKey,
  useGetLmStudioUrl,
  useSetLmStudioUrl,
  testLmStudioConnection,
  type LmStudioConnectionResult,
  useListTouchpoints,
  useGetTouchpointsConfig,
  useUpdateTouchpointsConfig,
  useUpdateTouchpoint,
  getListTouchpointsQueryKey,
  getGetTouchpointsConfigQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SystemJobsPanel } from "@/components/system-jobs-panel";
import { useToast } from "@/hooks/use-toast";

const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SettingsTab = "general" | "jessica" | "store" | "medications" | "ai-model" | "access" | "system";

function TouchpointsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useGetTouchpointsConfig();
  const { data: touchpoints } = useListTouchpoints();
  const updateConfig = useUpdateTouchpointsConfig();
  const patchTouchpoint = useUpdateTouchpoint();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetTouchpointsConfigQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListTouchpointsQueryKey() });
  };

  const handleTestModeToggle = (callTestMode: boolean) => {
    if (!callTestMode) {
      const sure = window.confirm(
        "Turn OFF test mode?\n\nEvery call Jessica makes — scheduled or manual — will dial POPS' REAL NUMBER from now on.\n\nOnly do this after a test day you're happy with."
      );
      if (!sure) return;
    }
    updateConfig.mutate({ data: { callTestMode } }, {
      onSuccess: () => { refresh(); toast({ title: callTestMode ? "Test mode ON — all calls go to your phone" : "Test mode OFF — calls now dial Pops" }); },
      onError: () => toast({ title: "Failed to change test mode — nothing changed", variant: "destructive" }),
    });
  };

  const handleTouchpointPatch = (id: number, patch: { active?: boolean; timeOfDay?: string }) => {
    patchTouchpoint.mutate({ id, data: patch }, {
      onSuccess: refresh,
      onError: () => toast({ title: "Failed to save touchpoint", variant: "destructive" }),
    });
  };

  const testMode = config?.callTestMode ?? true;

  return (
    <>
      <Card className={testMode ? "border-success/50" : "border-destructive"}>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Shield size={14} className={testMode ? "text-success" : "text-destructive"} /> Call Safety
          </CardTitle>
          <CardDescription>
            {testMode
              ? "TEST MODE is on: every call Jessica makes — scheduled or manual — dials YOUR phone, never Pops'. This is the default."
              : "TEST MODE IS OFF: calls dial Pops' real number."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="call-test-mode" className="text-sm font-medium">
              {testMode ? "All calls go to my phone (test mode)" : "Calls go to Pops (LIVE)"}
            </label>
            <Switch id="call-test-mode" checked={testMode} onCheckedChange={handleTestModeToggle} />
          </div>
          {config && !config.adminPhoneSet && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle size={12} /> ADMIN_PHONE_NUMBER secret is not set — test-mode calls can't be placed until it is.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Phone size={14} className="text-primary" /> Daily Touchpoints
          </CardTitle>
          <CardDescription>
            Jessica's short purpose-driven calls across the day. They fire only while the automatic daily call
            switch above is on, and each one runs at most once a day. Times are Pacific.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(touchpoints ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0">
              <Switch
                id={`touchpoint-${t.id}`}
                checked={t.active}
                onCheckedChange={(active) => handleTouchpointPatch(t.id, { active })}
              />
              <label htmlFor={`touchpoint-${t.id}`} className="flex-1 text-sm font-medium">
                {t.title}
              </label>
              <Input
                type="time"
                value={t.timeOfDay}
                onChange={(e) => e.target.value && handleTouchpointPatch(t.id, { timeOfDay: e.target.value })}
                className="max-w-[130px]"
              />
            </div>
          ))}
          {touchpoints && touchpoints.length === 0 && (
            <p className="text-xs text-muted-foreground">No touchpoints yet — they seed automatically when the server starts.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SavedBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success font-display uppercase tracking-widest animate-in fade-in duration-200">
      <Check size={11} /> Saved
    </span>
  );
}

function useAppSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/settings`);
      if (res.ok) setSettings(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch: Record<string, string>): Promise<boolean> => {
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return false;
      setSettings((prev) => ({ ...prev, ...patch }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { settings, loading, save, reload: load };
}

// ─── General Tab ─────────────────────────────────────────────────────────────
function GeneralTab() {
  const { settings, loading, save } = useAppSettings();
  const { data: healthSettings } = useGetAssessmentSettings();
  const updateHealthSettings = useUpdateAssessmentSettings();
  const { toast } = useToast();
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [appName, setAppName] = useState("Brain Guardian");

  const [quietForm, setQuietForm] = useState({
    quietWindowStart: "22:00",
    quietWindowEnd: "07:00",
    engagementIntervalHours: 4,
  });

  const [haldolForm, setHaldolForm] = useState({
    haldol_injection_interval_days: "28",
    haldol_zombie_phase_days: "5",
  });

  useEffect(() => {
    if (healthSettings) {
      setQuietForm({
        quietWindowStart: (healthSettings as any).quietWindowStart ?? "22:00",
        quietWindowEnd: (healthSettings as any).quietWindowEnd ?? "07:00",
        engagementIntervalHours: (healthSettings as any).engagementIntervalHours ?? 4,
      });
    }
  }, [healthSettings]);

  useEffect(() => {
    if (!loading) {
      setAppName(settings.app_name ?? "Brain Guardian");
      setHaldolForm({
        haldol_injection_interval_days: settings.haldol_injection_interval_days ?? "28",
        haldol_zombie_phase_days: settings.haldol_zombie_phase_days ?? "5",
      });
    }
  }, [loading, settings]);

  const saveAppName = async () => {
    const ok = await save({ app_name: appName.trim() || "Brain Guardian" });
    if (ok) flash("app_name");
    else toast({ title: "Failed to save app name", variant: "destructive" });
  };

  const flash = (key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  };

  const saveHaldol = async () => {
    const ok = await save(haldolForm);
    if (ok) flash("haldol");
    else toast({ title: "Failed to save Haldol config", variant: "destructive" });
  };

  const saveQuiet = () => {
    updateHealthSettings.mutate({ data: quietForm }, {
      onSuccess: () => flash("quiet"),
      onError: () => toast({ title: "Failed to save quiet window", variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest">App Name</CardTitle>
          <CardDescription>The name displayed in the app header and session context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            onBlur={saveAppName}
            placeholder="Brain Guardian"
          />
          <SavedBadge visible={savedKey === "app_name"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Syringe size={14} className="text-primary" /> Haldol Cycle Configuration
          </CardTitle>
          <CardDescription>
            Configure the injection schedule. Used by Jessica to determine Pops' current cycle phase and zombie window.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Injection Interval (days)</label>
              <Input
                type="number"
                min={7}
                max={90}
                value={haldolForm.haldol_injection_interval_days}
                onChange={(e) => setHaldolForm({ ...haldolForm, haldol_injection_interval_days: e.target.value })}
                onBlur={saveHaldol}
              />
              <p className="text-xs text-muted-foreground">Days between injections — typically 14.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Zombie Phase (days)</label>
              <Input
                type="number"
                min={1}
                max={14}
                value={haldolForm.haldol_zombie_phase_days}
                onChange={(e) => setHaldolForm({ ...haldolForm, haldol_zombie_phase_days: e.target.value })}
                onBlur={saveHaldol}
              />
              <p className="text-xs text-muted-foreground">Peak sedation days post-injection.</p>
            </div>
          </div>
          <SavedBadge visible={savedKey === "haldol"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} className="text-primary" /> Quiet Window
          </CardTitle>
          <CardDescription>Jessica will not initiate check-ins during these hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Start (e.g. 22:00)</label>
              <Input
                value={quietForm.quietWindowStart}
                onChange={(e) => setQuietForm({ ...quietForm, quietWindowStart: e.target.value })}
                onBlur={saveQuiet}
                placeholder="22:00"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">End (e.g. 07:00)</label>
              <Input
                value={quietForm.quietWindowEnd}
                onChange={(e) => setQuietForm({ ...quietForm, quietWindowEnd: e.target.value })}
                onBlur={saveQuiet}
                placeholder="07:00"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase text-muted-foreground">Engagement Interval (hours)</label>
            <Input
              type="number"
              min={1}
              max={24}
              value={quietForm.engagementIntervalHours}
              onChange={(e) => setQuietForm({ ...quietForm, engagementIntervalHours: parseInt(e.target.value) || 4 })}
              onBlur={saveQuiet}
              className="max-w-[120px]"
            />
            <p className="text-xs text-muted-foreground">How often Jessica proactively checks in with Pops.</p>
          </div>
          <SavedBadge visible={savedKey === "quiet"} />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Jessica Tab ──────────────────────────────────────────────────────────────
function JessicaTab() {
  const { settings, loading, save } = useAppSettings();
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const { data: healthSettings } = useGetAssessmentSettings();
  const updateHealthSettings = useUpdateAssessmentSettings();
  const [callForm, setCallForm] = useState({ dailyCallEnabled: false, dailyCallTime: "10:00" });
  const [syncingTools, setSyncingTools] = useState(false);
  const [toolsSyncResult, setToolsSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!loading) setPhone(settings.pops_phone_number ?? "");
  }, [loading, settings]);

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

  const flash = (key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  };

  const savePhone = async () => {
    const trimmed = phone.trim();
    const ok = await save({ pops_phone_number: trimmed });
    if (ok) flash("phone");
    else toast({ title: "Failed to save phone number", variant: "destructive" });
  };

  const handleSyncTools = async () => {
    setSyncingTools(true);
    setToolsSyncResult(null);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/jessica/sync-tools`, { method: "POST" });
      const data = await res.json();
      setToolsSyncResult({ ok: !!data.ok, message: data.message ?? (data.ok ? "Synced." : "Sync failed.") });
    } catch {
      setToolsSyncResult({ ok: false, message: "Couldn't reach the server — try again in a moment." });
    } finally {
      setSyncingTools(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Phone size={14} className="text-primary" /> Pops' Phone Number
          </CardTitle>
          <CardDescription>
            When Ray hits "Call Pops," Jessica will ring this number directly. Pops answers his regular phone — no app needed.
            Include country code (e.g. +17605551234).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={savePhone}
              onKeyDown={(e) => { if (e.key === "Enter") savePhone(); }}
              placeholder="+17605551234"
              maxLength={20}
              className="max-w-[220px] font-mono"
              type="tel"
            />
            <SavedBadge visible={savedKey === "phone"} />
          </div>
          {phone.trim() && !/^\+\d{10,15}$/.test(phone.trim()) && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
              <AlertTriangle size={11} /> Use E.164 format: +1 followed by 10 digits (e.g. +17605551234)
            </p>
          )}
          <p className="text-xs text-muted-foreground/60">
            Leave blank to use the in-app chat mode as a fallback.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Clock size={14} className="text-primary" /> Daily Call
          </CardTitle>
          <CardDescription>Jessica calls Pops automatically at this time every day (Pacific).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <label htmlFor="daily-call-toggle" className="text-sm font-medium">
              {callForm.dailyCallEnabled ? "Automatic daily call is on" : "Automatic daily call is off"}
            </label>
            <Switch id="daily-call-toggle" checked={callForm.dailyCallEnabled} onCheckedChange={handleCallToggle} />
          </div>
          <form onSubmit={handleCallTimeSave} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-muted-foreground">Call Time (24h, Pacific)</label>
              <Input
                type="time"
                min="06:00"
                max="20:00"
                value={callForm.dailyCallTime}
                onChange={(e) => setCallForm({ ...callForm, dailyCallTime: e.target.value })}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">Must be between 6:00 AM and 8:00 PM.</p>
            </div>
            <Button type="submit" disabled={updateHealthSettings.isPending}>Save Call Time</Button>
          </form>
        </CardContent>
      </Card>

      <TouchpointsPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            🔑 ElevenLabs Credentials
          </CardTitle>
          <CardDescription>
            Outbound calling requires three Replit secrets set by Ray:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs font-mono text-muted-foreground">
          <div className="space-y-1">
            <p><span className="text-foreground font-bold">ELEVENLABS_API_KEY</span> — Your ElevenLabs account API key</p>
            <p><span className="text-foreground font-bold">ELEVENLABS_AGENT_ID</span> — The Conversational AI agent ID from ElevenLabs dashboard</p>
            <p><span className="text-foreground font-bold">ELEVENLABS_PHONE_NUMBER_ID</span> — The phone number ID of your Twilio caller in ElevenLabs</p>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30">
            <p className="text-muted-foreground/60 normal-case tracking-normal font-sans">
              Set these in the Replit Secrets panel. When all three are configured and Pops' number is saved above,
              the "Call Pops" button will use ElevenLabs instead of the in-app chat.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest">Webhook URL</CardTitle>
          <CardDescription>
            Paste this into your ElevenLabs agent's webhook settings so call transcripts are automatically saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 p-2 bg-secondary/50 border border-border/40 rounded-sm">
            <code className="text-xs text-muted-foreground flex-1 break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/api/jessica/elevenlabs-webhook` : "/api/jessica/elevenlabs-webhook"}
            </code>
            <button
              onClick={() => {
                const url = `${window.location.origin}/api/jessica/elevenlabs-webhook`;
                navigator.clipboard.writeText(url).then(() => {
                  flash("webhook");
                });
              }}
              className="text-xs text-primary hover:underline shrink-0"
            >
              {savedKey === "webhook" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground/60">
            Set the event type to <span className="font-mono">post_call_transcription</span> in ElevenLabs.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Activity size={14} className="text-primary" /> Voice Task Tools
          </CardTitle>
          <CardDescription>
            Lets Jessica add, remove, and reschedule tasks — and turn the daily call on/off — right during a phone
            call, no dashboard needed. Run this once ElevenLabs is set up above, and again anytime the tools need
            to be refreshed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleSyncTools} disabled={syncingTools} variant="outline">
            {syncingTools ? "Syncing…" : "Sync Jessica's Tools"}
          </Button>
          {toolsSyncResult && (
            <p className={`text-xs flex items-start gap-1.5 ${toolsSyncResult.ok ? "text-emerald-500" : "text-amber-500"}`}>
              {toolsSyncResult.ok ? (
                <Check size={12} className="mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              )}
              <span>{toolsSyncResult.message}</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Store Tab ────────────────────────────────────────────────────────────────
function StoreTab() {
  const { settings, loading, save } = useAppSettings();
  const { toast } = useToast();
  const [zip, setZip] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!loading) setZip(settings.zip_code ?? "");
  }, [loading, settings]);

  const flash = (key: string) => {
    setSavedKey(key);
    setTimeout(() => setSavedKey(null), 2000);
  };

  const saveZip = async () => {
    if (!zip.trim()) return;
    const ok = await save({ zip_code: zip.trim() });
    if (ok) { flash("zip"); setTestResult(null); }
    else toast({ title: "Failed to save zip code", variant: "destructive" });
  };

  const saveStore = async (key: string) => {
    const ok = await save({ preferred_store: key });
    if (ok) flash("store");
    else toast({ title: "Failed to save store preference", variant: "destructive" });
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/settings/test-store`, { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, error: "Could not reach the API server" });
    } finally {
      setTesting(false);
    }
  };

  const preferredStore = settings.preferred_store ?? "both";

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <MapPin size={14} className="text-primary" /> Delivery Zip Code
          </CardTitle>
          <CardDescription>Used by the Shopper agent to filter nearby store locations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Input
              value={zip}
              onChange={(e) => { setZip(e.target.value); setTestResult(null); }}
              onBlur={saveZip}
              onKeyDown={(e) => { if (e.key === "Enter") saveZip(); }}
              placeholder="e.g. 92109"
              maxLength={10}
              className="max-w-[180px]"
            />
            <SavedBadge visible={savedKey === "zip"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Store size={14} className="text-primary" /> Preferred Store
          </CardTitle>
          <CardDescription>Tells Jessica which stores to prioritize when building the cart.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "walmart", label: "Walmart" },
              { key: "stater_bros", label: "Stater Bros" },
              { key: "both", label: "Both (Price Compare)" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => saveStore(key)}
                className={`px-4 py-2 rounded-sm border text-sm font-bold uppercase tracking-wide transition-all ${
                  preferredStore === key
                    ? "bg-primary/15 border-primary text-primary"
                    : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <SavedBadge visible={savedKey === "store"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            🔌 Store Connection Test
          </CardTitle>
          <CardDescription>Verify the configured zip and store can return inventory results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing
              ? <><Loader2 size={14} className="animate-spin mr-2" />Testing…</>
              : "Test Store Connection"
            }
          </Button>
          {testResult && (
            <div className={`p-3 rounded-sm border text-xs font-display uppercase tracking-widest ${
              testResult.ok
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}>
              {testResult.ok
                ? <><Check size={12} className="inline mr-1" />{testResult.message}</>
                : <><X size={12} className="inline mr-1" />{testResult.error}</>
              }
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Medications Tab ──────────────────────────────────────────────────────────
interface MedItem {
  id: number;
  name: string;
  dose: string;
  frequency: string;
  timeOfDay: string;
  active: boolean;
  notes: string | null;
}

const FREQ_OPTIONS = ["daily", "twice daily", "three times daily", "weekly", "as needed"];
const TIME_OPTIONS = [
  { key: "morning", label: "Morning" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
  { key: "bedtime", label: "Bedtime" },
  { key: "morning+evening", label: "Morning + Evening" },
  { key: "with meals", label: "With Meals" },
];

function MedicationsTab() {
  const { toast } = useToast();
  const [meds, setMeds] = useState<MedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", dose: "", frequency: "daily", timeOfDay: "morning", notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/medications`);
      if (res.ok) setMeds(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ name: "", dose: "", frequency: "daily", timeOfDay: "morning", notes: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.dose.trim()) return;
    setSubmitting(true);
    try {
      const url = editId
        ? `${WORKSPACE_BASE}/api/medications/${editId}`
        : `${WORKSPACE_BASE}/api/medications`;
      const res = await fetch(url, {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, notes: form.notes || null }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: editId ? "Medication updated" : "Medication added" });
      resetForm();
      setShowAdd(false);
      setEditId(null);
      await load();
    } catch {
      toast({ title: "Failed to save medication", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (med: MedItem) => {
    setForm({ name: med.name, dose: med.dose, frequency: med.frequency, timeOfDay: med.timeOfDay, notes: med.notes ?? "" });
    setEditId(med.id);
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const archive = async (id: number) => {
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/medications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Medication archived" });
      await load();
    } catch {
      toast({ title: "Failed to archive medication", variant: "destructive" });
    }
  };

  const restore = async (id: number) => {
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/medications/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Medication restored" });
      await load();
    } catch {
      toast({ title: "Failed to restore medication", variant: "destructive" });
    }
  };

  const active = meds.filter((m) => m.active);
  const archived = meds.filter((m) => !m.active);

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${active.length} active medication${active.length !== 1 ? "s" : ""}`}
        </p>
        <Button
          size="sm"
          onClick={() => { resetForm(); setEditId(null); setShowAdd(true); }}
        >
          <Plus size={14} className="mr-1" /> Add Medication
        </Button>
      </div>

      {showAdd && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-display uppercase tracking-widest">
              {editId ? "Edit Medication" : "New Medication"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Name *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Haldol Decanoate"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Dose *</label>
                  <Input
                    value={form.dose}
                    onChange={(e) => setForm({ ...form, dose: e.target.value })}
                    placeholder="e.g. 100mg"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {FREQ_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Time of Day</label>
                  <select
                    value={form.timeOfDay}
                    onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
                    className="w-full bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {TIME_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase text-muted-foreground">Notes (optional)</label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes…"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? "Saving…" : editId ? "Update" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowAdd(false); setEditId(null); resetForm(); }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 size={16} className="animate-spin" /> Loading medications…
        </div>
      ) : active.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/50 rounded-md">
          <Pill className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No medications added yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Track Pops' medications so Jessica can answer "did he take his meds?" accurately.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((med) => {
            const timeLabel = TIME_OPTIONS.find((t) => t.key === med.timeOfDay)?.label ?? med.timeOfDay;
            return (
              <Card key={med.id} className="border-border/40">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold text-sm uppercase tracking-widest">{med.name}</p>
                        <Badge variant="outline" className="text-xs font-mono">{med.dose}</Badge>
                        <Badge variant="secondary" className="text-xs capitalize">{med.frequency}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">⏰ {timeLabel}</p>
                      {med.notes && (
                        <p className="text-xs text-muted-foreground/60 mt-1 italic">{med.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(med)}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => archive(med.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Archive"
                      >
                        <Archive size={14} />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1.5 transition-colors"
          >
            <Archive size={11} />
            {showArchived ? "Hide" : "Show"} {archived.length} archived medication{archived.length !== 1 ? "s" : ""}
          </button>
          {showArchived && (
            <div className="space-y-2 mt-3 opacity-60">
              {archived.map((med) => (
                <div key={med.id} className="flex items-center justify-between px-4 py-2.5 border border-border/30 rounded-sm bg-secondary/20">
                  <span className="text-sm line-through text-muted-foreground">
                    {med.name} — {med.dose}
                  </span>
                  <button
                    onClick={() => restore(med.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Model Tab ─────────────────────────────────────────────────────────────
function AiModelTab() {
  const { data: aiStatus, refetch } = useGetAiModel({ query: { queryKey: getGetAiModelQueryKey() } });
  const setAiModel = useSetAiModel();
  const { toast } = useToast();

  const activeModel = (aiStatus as any)?.activeModel ?? "gemini";
  const models: Array<{ id: string; label: string; provider: string; lmStudioModelId: string | null }> =
    (aiStatus as any)?.models ?? [];

  const { data: lmUrlData } = useGetLmStudioUrl();
  const saveLmUrl = useSetLmStudioUrl();

  const [lmUrl, setLmUrl] = useState("http://localhost:1234");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LmStudioConnectionResult | null>(null);

  useEffect(() => {
    if ((lmUrlData as any)?.url) setLmUrl((lmUrlData as any).url);
  }, [lmUrlData]);

  const handleSelect = (modelId: string) => {
    setAiModel.mutate({ data: { activeModel: modelId } }, {
      onSuccess: () => {
        toast({
          title: "AI model updated",
          description: `Now using: ${models.find((m) => m.id === modelId)?.label ?? modelId}`,
        });
        refetch();
      },
      onError: () => toast({ title: "Failed to update model", variant: "destructive" }),
    });
  };

  const handleSaveUrl = () => {
    setTestResult(null);
    saveLmUrl.mutate({ data: { url: lmUrl.trim() } }, {
      onSuccess: () => toast({ title: "LM Studio URL saved" }),
      onError: () => toast({ title: "Failed to save URL", variant: "destructive" }),
    });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const d = await testLmStudioConnection({ url: lmUrl.trim() });
      setTestResult(d);
    } catch {
      setTestResult({ connected: false, error: "Could not reach the API server" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-primary" /> Active Model
          </CardTitle>
          <CardDescription>
            Select which AI model powers Jessica's conversations. LM Studio models require the app to be open with the model loaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {models.map((model) => {
            const isActive = model.id === activeModel;
            const isLm = model.provider === "lmstudio";
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                disabled={setAiModel.isPending}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-sm border transition-all text-left ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-foreground hover:border-primary/40 hover:bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{isLm ? "🖥️" : "✨"}</span>
                  <div>
                    <p className="font-display text-sm uppercase tracking-widest font-bold">{model.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {isLm ? "Local · LM Studio" : "Cloud · Google"}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <span className="px-2 py-0.5 text-xs font-display uppercase tracking-widest bg-primary/20 text-primary rounded-sm border border-primary/30">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit size={18} className="text-muted-foreground" /> LM Studio URL
          </CardTitle>
          <CardDescription>
            Paste your LM Studio address here. Use a tunnel (ngrok, Cloudflare Tunnel) to reach it from the deployed app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={lmUrl}
              onChange={(e) => { setLmUrl(e.target.value); setTestResult(null); }}
              placeholder="http://localhost:1234"
              className="flex-1 bg-secondary border border-border rounded-sm px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button size="sm" onClick={handleSaveUrl} disabled={saveLmUrl.isPending}>
              {saveLmUrl.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing}
            className="w-full"
          >
            {testing ? "Testing…" : "Test Connection"}
          </Button>
          {testResult && (
            <div className={`p-3 rounded-sm border text-xs font-display space-y-2 ${
              testResult.connected
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}>
              <p className="uppercase tracking-widest">
                {testResult.connected
                  ? `Connected — ${testResult.modelCount ?? 0} model${testResult.modelCount === 1 ? "" : "s"} loaded`
                  : `Not reachable — ${testResult.error ?? "unknown error"}`
                }
              </p>
              {testResult.connected && testResult.modelIds && testResult.modelIds.length > 0 && (
                <ul className="space-y-1 pt-1 border-t border-success/20">
                  {testResult.modelIds.map((id) => {
                    const knownModel = models.find(
                      (m) => m.lmStudioModelId && id.toLowerCase().includes(m.lmStudioModelId.toLowerCase())
                    );
                    return (
                      <li key={id} className={`flex items-center gap-2 ${knownModel ? "text-success" : "text-success/50"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${knownModel ? "bg-success" : "bg-success/30"}`} />
                        <span className="font-mono normal-case tracking-normal truncate">{id}</span>
                        {knownModel && <span className="ml-auto shrink-0 opacity-60">{knownModel.label}</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
              {testResult.connected && (testResult.modelIds ?? []).length === 0 && (
                <p className="uppercase tracking-widest text-accent border-t border-success/20 pt-1">
                  No models loaded — open a model in LM Studio
                </p>
              )}
              {testResult.connected &&
                activeModel !== "gemini" &&
                (testResult.modelIds ?? []).length > 0 &&
                (() => {
                  const activeInfo = models.find((m) => m.id === activeModel);
                  const isLoaded =
                    activeInfo?.lmStudioModelId &&
                    testResult.modelIds!.some((id) =>
                      id.toLowerCase().includes(activeInfo.lmStudioModelId!.toLowerCase())
                    );
                  return !isLoaded ? (
                    <p className="uppercase tracking-widest text-accent border-t border-success/20 pt-1">
                      ⚠ Active model ({activeInfo?.label ?? activeModel}) not found in loaded list
                    </p>
                  ) : null;
                })()}
            </div>
          )}
          <p className="text-xs text-muted-foreground/50">
            Falls back to <span className="font-mono">LM_STUDIO_URL</span> env var, then{" "}
            <span className="font-mono">http://localhost:1234</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Access Tab ───────────────────────────────────────────────────────────────
function AccessTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    currentPassphrase: "",
    newPassphrase: "",
    confirmPassphrase: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const mismatch = form.confirmPassphrase.length > 0 && form.newPassphrase !== form.confirmPassphrase;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    if (form.newPassphrase.length < 4) {
      toast({ title: "New passphrase must be at least 4 characters", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/auth/change-passphrase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to change passphrase", variant: "destructive" });
        return;
      }
      toast({ title: "Passphrase changed", description: "Your new passphrase is active. Use it next time you unlock." });
      setForm({ currentPassphrase: "", newPassphrase: "", confirmPassphrase: "" });
    } catch {
      toast({ title: "Failed to change passphrase", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Shield size={14} className="text-primary" /> Change Vault Passphrase
          </CardTitle>
          <CardDescription>
            Update the passphrase required to unlock the Brain Guardian workspace. Enter your current passphrase to confirm the change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Current Passphrase</label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={form.currentPassphrase}
                  onChange={(e) => setForm({ ...form, currentPassphrase: e.target.value })}
                  placeholder="Enter current passphrase"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">New Passphrase</label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={form.newPassphrase}
                  onChange={(e) => setForm({ ...form, newPassphrase: e.target.value })}
                  placeholder="At least 4 characters"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Confirm New Passphrase</label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={form.confirmPassphrase}
                  onChange={(e) => setForm({ ...form, confirmPassphrase: e.target.value })}
                  placeholder="Repeat new passphrase"
                  className={`pr-10 ${mismatch ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mismatch && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle size={11} /> Passphrases do not match
                </p>
              )}
            </div>

            <Button type="submit" disabled={submitting || mismatch || !form.currentPassphrase}>
              {submitting ? "Changing…" : "Change Passphrase"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="p-4 border border-border/30 rounded-md bg-secondary/30 text-xs text-muted-foreground space-y-1">
        <p className="font-bold uppercase tracking-widest text-muted-foreground/70">How passphrases work</p>
        <p>The vault passphrase is checked in this order: your stored passphrase (if you've changed it here), then the <span className="font-mono">VAULT_PASSPHRASE</span> environment variable, then the development fallback.</p>
        <p className="text-muted-foreground/50 mt-2">Multi-tenant caregiver roster management is available in Phase 6 (Brain Guardian).</p>
      </div>
    </div>
  );
}

// ─── Sidebar Nav ──────────────────────────────────────────────────────────────
function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-display uppercase tracking-widest transition-colors ${
        active
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Main Settings View ───────────────────────────────────────────────────────
export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>("general");
  const [, navigate] = useLocation();

  const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "general", label: "General", icon: <Settings size={16} /> },
    { id: "jessica", label: "Jessica", icon: <Phone size={16} /> },
    { id: "store", label: "Store", icon: <Store size={16} /> },
    { id: "medications", label: "Medications", icon: <Pill size={16} /> },
    { id: "ai-model", label: "AI Model", icon: <BrainCircuit size={16} /> },
    { id: "access", label: "Access", icon: <Shield size={16} /> },
    { id: "system", label: "System", icon: <Activity size={16} /> },
  ];

  const tabTitle: Record<SettingsTab, string> = {
    general: "General",
    jessica: "Jessica Calling",
    store: "Store Preferences",
    medications: "Medications",
    "ai-model": "AI Model",
    access: "Access & Security",
    system: "System Jobs",
  };

  const tabDesc: Record<SettingsTab, string> = {
    general: "Haldol cycle timing, quiet window, and engagement schedule.",
    jessica: "Pops' phone number and ElevenLabs outbound call configuration.",
    store: "Zip code, preferred grocery store, and connection testing.",
    medications: "Track Pops' active medications so Jessica can verify adherence.",
    "ai-model": "Choose which AI model powers Jessica and configure LM Studio.",
    access: "Change the vault passphrase and manage access.",
    system: "Scheduled background jobs and their recent run history.",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-60 bg-card border-r border-border shrink-0 flex flex-col">
        <div className="p-5 border-b border-border/50">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft size={14} /> Back to Command
          </button>
          <div className="flex items-center gap-2.5">
            <Settings className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-xl font-display font-bold text-primary tracking-widest leading-none">SETTINGS</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Configuration</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1 flex-1">
          {TABS.map((t) => (
            <TabButton
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              icon={t.icon}
              label={t.label}
            />
          ))}
        </nav>

        <div className="p-4 border-t border-border/30">
          <p className="text-xs text-muted-foreground/40 uppercase tracking-widest font-display">Unconditional Software v1</p>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8 border-b border-border/40 pb-4">
            <h2 className="text-3xl font-display text-primary tracking-widest uppercase">{tabTitle[tab]}</h2>
            <p className="text-muted-foreground text-sm mt-1">{tabDesc[tab]}</p>
          </header>

          {tab === "general" && <GeneralTab />}
          {tab === "jessica" && <JessicaTab />}
          {tab === "store" && <StoreTab />}
          {tab === "medications" && <MedicationsTab />}
          {tab === "ai-model" && <AiModelTab />}
          {tab === "access" && <AccessTab />}
          {tab === "system" && <SystemJobsPanel />}
        </div>
      </main>
    </div>
  );
}
