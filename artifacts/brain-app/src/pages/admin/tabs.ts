/* Admin tab registry — shared by the nav rail and the dashboard's
   quick actions so both stay in step with the route split.
   `tier` mirrors api-server routes/index.ts: "core" tabs work for any
   session, "local" tabs hit Ray's local-only specialty routers and are
   hidden (not disabled) for tenant/demo sessions. */
export type Tab =
  | "dashboard"
  | "schedule"
  | "symptoms"
  | "scripts"
  | "haldol"
  | "health"
  | "shopper"
  | "rotation"
  | "inventory"
  | "calendar-sync"
  | "appointments"
  | "documents"
  | "devices";

export interface TabDef {
  id: Tab;
  label: string;
  /** Shorter label for the phone rail, where width is tight. */
  shortLabel?: string;
  tier: "core" | "local";
  /** Starts a new visual group in the rail. */
  groupStart?: boolean;
}

export const TAB_DEFS: readonly TabDef[] = [
  { id: "dashboard", label: "Dashboard", tier: "core" },
  { id: "schedule", label: "Schedule", tier: "core" },
  { id: "symptoms", label: "Symptoms", tier: "core" },
  { id: "inventory", label: "Inventory", tier: "core" },
  { id: "scripts", label: "Voice Scripts", shortLabel: "Scripts", tier: "local" },
  { id: "haldol", label: "Haldol", tier: "local" },
  { id: "health", label: "Health Intel", shortLabel: "Health", tier: "local" },
  { id: "shopper", label: "Shopper", tier: "local" },
  { id: "devices", label: "Devices", tier: "local" },
  { id: "rotation", label: "Rotation", tier: "local" },
  { id: "calendar-sync", label: "Calendar Sync", shortLabel: "Calendar", tier: "local" },
  { id: "appointments", label: "Appointments", shortLabel: "Appts", tier: "local", groupStart: true },
  { id: "documents", label: "Scan Docs", shortLabel: "Docs", tier: "local" },
];
