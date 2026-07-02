const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type CalendarEventType = "appointment" | "medication" | "shopping" | "task" | "urgent" | "custom";

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startTime: string;
  endTime?: string;
  allDay?: boolean;
  reminderMinutes?: number;
}

export interface CalendarPushResult {
  success: boolean;
  eventLink?: string | null;
  eventId?: string | null;
  error?: string;
}

const EVENT_TYPE_REMINDER_MINUTES: Record<CalendarEventType, number | undefined> = {
  appointment: 30,
  medication: 0,
  shopping: undefined,
  task: 30,
  urgent: 0,
  custom: 30,
};

export function getDefaultReminderMinutes(type: CalendarEventType): number | undefined {
  return EVENT_TYPE_REMINDER_MINUTES[type];
}

export function getGoogleToken(): string | null {
  return localStorage.getItem("brain_google_token");
}

export function promptGoogleToken(toast: (opts: any) => void): string | null {
  const existing = getGoogleToken();
  const token = window.prompt(
    "Paste your Google OAuth2 access token (Calendar + Drive scope):\n\nGet one at: https://developers.google.com/oauthplayground\nScopes: calendar.events, drive.file\n\nExisting token will be overwritten.",
    existing ?? ""
  );
  if (token && token.trim()) {
    localStorage.setItem("brain_google_token", token.trim());
    toast({ title: "Google token saved", description: "Your token is stored in browser storage for this session." });
    return token.trim();
  }
  return existing;
}

export async function pushToCalendar(
  token: string,
  event: CalendarEventInput,
  eventType: CalendarEventType = "custom"
): Promise<CalendarPushResult> {
  const reminderMinutes =
    event.reminderMinutes !== undefined
      ? event.reminderMinutes
      : getDefaultReminderMinutes(eventType);

  const payload: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay ?? false,
  };

  if (reminderMinutes !== undefined && !event.allDay) {
    payload.reminderMinutes = reminderMinutes;
  }

  try {
    const res = await fetch(`${WORKSPACE_BASE}/api/calendar/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-google-access-token": token,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error ?? "Calendar push failed." };
    }
    return { success: true, eventLink: data.eventLink ?? null, eventId: data.eventId ?? null };
  } catch {
    return { success: false, error: "Failed to reach Calendar API." };
  }
}

export function makeMedEventDescription(opts: {
  cycleDay: number | null;
  nextInjectionDate: string;
  isZombiePhase: boolean;
  notes?: string | null;
}): string {
  const lines = [
    "💊 Haldol Decanoate Injection",
    `Cycle Day: ${opts.cycleDay ?? "??"}/14`,
    opts.isZombiePhase
      ? "⚠ High Symptom Phase — reduced stimulation recommended (Days 1–5)"
      : "✓ Stabilization Phase",
    `Scheduled Date: ${opts.nextInjectionDate}`,
    "Dose: Per prescribing physician's order",
    "Administer: IM injection as directed",
  ];
  if (opts.notes) lines.push(`Clinical Notes: ${opts.notes}`);
  lines.push("\nAction: Confirm dose, verify cycle reset in br(AI)n App after administration.");
  return lines.join("\n");
}

export function makeShoppingEventDescription(opts: {
  weekStartDate: string;
  items: Array<{ ingredientName: string; totalQuantity: number; unit: string; estimatedCostCents: number }>;
  totalCostCents: number;
  budgetCents: number;
}): string {
  const lines = [
    `🛒 Weekly Grocery Run — Week of ${opts.weekStartDate}`,
    `Budget: $${(opts.totalCostCents / 100).toFixed(2)} of $${(opts.budgetCents / 100).toFixed(2)}`,
    "",
    "Shopping List:",
    ...opts.items.map(
      (item) => `• ${item.ingredientName}: ${item.totalQuantity} ${item.unit} — $${(item.estimatedCostCents / 100).toFixed(2)}`
    ),
    "",
    "Open br(AI)n App → Shopper to review cart before heading out.",
  ];
  return lines.join("\n");
}

export function makeUrgentItemDescription(opts: {
  ingredientName: string;
  totalQuantity: number;
  unit: string;
  estimatedCostCents: number;
}): string {
  return [
    `⚡ URGENT — Pick up: ${opts.ingredientName}`,
    `Quantity needed: ${opts.totalQuantity} ${opts.unit}`,
    `Estimated cost: $${(opts.estimatedCostCents / 100).toFixed(2)}`,
    "",
    "Open br(AI)n App → Shopper for full weekly list.",
  ].join("\n");
}

export function makeScheduleTaskDescription(t: {
  title: string;
  quarter: string;
  timeLabel: string;
  description?: string | null;
}): string {
  const lines = [
    `📋 Schedule Appointment — ${t.title}`,
    `Quarter: ${t.quarter} · Time: ${t.timeLabel}`,
  ];
  if (t.description) lines.push(`Details: ${t.description}`);
  lines.push("\nOpen br(AI)n App → Schedule for full task details.");
  return lines.join("\n");
}

export function makeRotationTaskDescription(t: {
  title: string;
  category: string;
  period: string;
  timeSlot: string;
  loggedNote?: string | null;
}): string {
  const lines = [
    `Category: ${t.category}`,
    `Period: ${t.period}`,
    `Time: ${t.timeSlot}`,
  ];
  if (t.loggedNote) lines.push(`Note: ${t.loggedNote}`);
  return lines.join("\n");
}

export function todayAtTime(timeSlot: string): string {
  const today = new Date().toISOString().split("T")[0];
  const parts = timeSlot.trim().split(" ");
  const timePart = parts[0];
  const ampm = parts[1]?.toUpperCase();
  const [hStr, mStr] = timePart.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr ?? "0", 10);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return new Date(
    `${today}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
  ).toISOString();
}

export function quarterToHour(quarter: string): number {
  const map: Record<string, number> = { Q1: 8, Q2: 13, Q3: 18, Q4: 22 };
  return map[quarter] ?? 9;
}

export function extractCalendarTitle(text: string): string {
  const appointmentMatch = text.match(
    /(?:pops has|there(?:'s| is) a|schedule[d]? a?n?|remind(?:er)? (?:about|for)?)\s+([A-Za-z ]+?(?:appointment|visit|injection|check[- ]up|meeting|session))/i
  );
  if (appointmentMatch) return appointmentMatch[1].trim();

  const urgentMatch = text.match(/(?:out of|low on|need[s]? more|reorder)\s+([A-Za-z ]+)/i);
  if (urgentMatch) return `🛒 Pick up: ${urgentMatch[1].trim()}`;

  const dayEventMatch = text.match(
    /(?:on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today))[,\s]+([A-Za-z ]{4,40})/i
  );
  if (dayEventMatch) return dayEventMatch[1].trim();

  return "Reminder from br(AI)n";
}

export function handleCalendarError(error: string, toast: (opts: any) => void): void {
  if (
    error.includes("denied") ||
    error.includes("access") ||
    error.includes("401") ||
    error.includes("403")
  ) {
    toast({
      title: "Google access denied",
      description: "Re-grant Calendar permissions in your Google Account.",
      variant: "destructive",
    });
  } else {
    toast({ title: "Calendar push failed", description: error, variant: "destructive" });
  }
}
