import { pgTable, text, integer, boolean, timestamp, date, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appStateTable = pgTable("app_state", {
  id: serial("id").primaryKey(),
  currentQuarter: text("current_quarter").notNull().default("Q1"),
  quarterOverride: text("quarter_override"),
  zombieMode: boolean("zombie_mode").notNull().default(false),
  motivationLevel: integer("motivation_level").notNull().default(3),
  lastUpdated: timestamp("last_updated").notNull().defaultNow(),
  activeMessage: text("active_message"),
  notes: text("notes"),
});

export const scheduleTasksTable = pgTable("schedule_tasks", {
  id: serial("id").primaryKey(),
  quarter: text("quarter").notNull(),
  timeLabel: text("time_label").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  voiceScript: text("voice_script"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const symptomLogsTable = pgTable("symptom_logs", {
  id: serial("id").primaryKey(),
  loggedAt: timestamp("logged_at").notNull().defaultNow(),
  ptsdTrigger: boolean("ptsd_trigger").notNull().default(false),
  hallucinationIntensity: integer("hallucination_intensity").notNull().default(0),
  motivationLevel: integer("motivation_level").notNull().default(3),
  behaviorNotes: text("behavior_notes"),
  loggedBy: text("logged_by").notNull().default("Raymo"),
});

export const voiceScriptsTable = pgTable("voice_scripts", {
  id: serial("id").primaryKey(),
  taskKey: text("task_key").notNull().unique(),
  label: text("label").notNull(),
  scriptText: text("script_text").notNull(),
  tone: text("tone").notNull().default("gentle"),
  isActive: boolean("is_active").notNull().default(true),
  lastPatched: timestamp("last_patched"),
  patchNote: text("patch_note"),
});

export const haldolCycleTable = pgTable("haldol_cycle", {
  id: serial("id").primaryKey(),
  lastInjectionDate: date("last_injection_date").notNull(),
  notes: text("notes"),
});

export const governorPillarsTable = pgTable("governor_pillars", {
  id: serial("id").primaryKey(),
  pillarKey: text("pillar_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  focusDurationMins: integer("focus_duration_mins").notNull().default(60),
  metrics: text("metrics"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const governorNotesTable = pgTable("governor_notes", {
  id: serial("id").primaryKey(),
  pillarKey: text("pillar_key"),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAppStateSchema = createInsertSchema(appStateTable).omit({ id: true });
export const insertScheduleTaskSchema = createInsertSchema(scheduleTasksTable).omit({ id: true });
export const insertSymptomLogSchema = createInsertSchema(symptomLogsTable).omit({ id: true });
export const insertVoiceScriptSchema = createInsertSchema(voiceScriptsTable).omit({ id: true });
export const insertHaldolCycleSchema = createInsertSchema(haldolCycleTable).omit({ id: true });
export const insertGovernorPillarSchema = createInsertSchema(governorPillarsTable).omit({ id: true });
export const insertGovernorNoteSchema = createInsertSchema(governorNotesTable).omit({ id: true });

export type AppState = typeof appStateTable.$inferSelect;
export type ScheduleTask = typeof scheduleTasksTable.$inferSelect;
export type SymptomLog = typeof symptomLogsTable.$inferSelect;
export type VoiceScript = typeof voiceScriptsTable.$inferSelect;
export type HaldolCycle = typeof haldolCycleTable.$inferSelect;
export type GovernorPillar = typeof governorPillarsTable.$inferSelect;
export type GovernorNote = typeof governorNotesTable.$inferSelect;

export type InsertAppState = z.infer<typeof insertAppStateSchema>;
export type InsertScheduleTask = z.infer<typeof insertScheduleTaskSchema>;
export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type InsertVoiceScript = z.infer<typeof insertVoiceScriptSchema>;
export type InsertHaldolCycle = z.infer<typeof insertHaldolCycleSchema>;
export type InsertGovernorPillar = z.infer<typeof insertGovernorPillarSchema>;
export type InsertGovernorNote = z.infer<typeof insertGovernorNoteSchema>;
