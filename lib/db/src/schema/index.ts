import { pgTable, text, integer, boolean, timestamp, date, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appStateTable = pgTable("app_state", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("local"),
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
  tenantId: text("tenant_id").notNull().default("local"),
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
  tenantId: text("tenant_id").notNull().default("local"),
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

export * from "./conversations";
export * from "./messages";

export const smartHomeDevicesTable = pgTable("smart_home_devices", {
  id: serial("id").primaryKey(),
  deviceKey: text("device_key").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  room: text("room").notNull(),
  isOn: boolean("is_on").notNull().default(false),
  volume: integer("volume"),
  brightness: integer("brightness"),
  meta: text("meta"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppStateSchema = createInsertSchema(appStateTable).omit({ id: true });
export const insertScheduleTaskSchema = createInsertSchema(scheduleTasksTable).omit({ id: true });
export const insertSymptomLogSchema = createInsertSchema(symptomLogsTable).omit({ id: true });
export const insertVoiceScriptSchema = createInsertSchema(voiceScriptsTable).omit({ id: true });
export const insertHaldolCycleSchema = createInsertSchema(haldolCycleTable).omit({ id: true });
export type AppState = typeof appStateTable.$inferSelect;
export type ScheduleTask = typeof scheduleTasksTable.$inferSelect;
export type SymptomLog = typeof symptomLogsTable.$inferSelect;
export type VoiceScript = typeof voiceScriptsTable.$inferSelect;
export type HaldolCycle = typeof haldolCycleTable.$inferSelect;
export type InsertAppState = z.infer<typeof insertAppStateSchema>;
export type InsertScheduleTask = z.infer<typeof insertScheduleTaskSchema>;
export type InsertSymptomLog = z.infer<typeof insertSymptomLogSchema>;
export type InsertVoiceScript = z.infer<typeof insertVoiceScriptSchema>;
export type InsertHaldolCycle = z.infer<typeof insertHaldolCycleSchema>;
export const insertSmartHomeDeviceSchema = createInsertSchema(smartHomeDevicesTable).omit({ id: true });

export type SmartHomeDevice = typeof smartHomeDevicesTable.$inferSelect;
export type InsertSmartHomeDevice = z.infer<typeof insertSmartHomeDeviceSchema>;

export const healthQuestionsTable = pgTable("health_questions", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  category: text("category").notNull(),
  responseType: text("response_type").notNull().default("yes_no"),
  cycleDays: text("cycle_days"),
  priority: integer("priority").notNull().default(5),
  alwaysAsk: boolean("always_ask").notNull().default(false),
  active: boolean("active").notNull().default(true),
  higherIsBetter: boolean("higher_is_better").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const callSessionsTable = pgTable("call_sessions", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id"),
  sessionDate: date("session_date").notNull(),
  cycleDay: integer("cycle_day"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  summary: text("summary"),
  flagged: boolean("flagged").notNull().default(false),
});

export const healthDataPointsTable = pgTable("health_data_points", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  questionId: integer("question_id"),
  category: text("category").notNull(),
  rawResponse: text("raw_response").notNull(),
  parsedValue: text("parsed_value"),
  parsedIntensity: text("parsed_intensity"),
  flagged: boolean("flagged").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const mealsTable = pgTable("meals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mealIngredientsTable = pgTable("meal_ingredients", {
  id: serial("id").primaryKey(),
  mealId: integer("meal_id").notNull(),
  name: text("name").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unit: text("unit").notNull().default("each"),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
});

export const groceryCartsTable = pgTable("grocery_carts", {
  id: serial("id").primaryKey(),
  weekStartDate: date("week_start_date").notNull(),
  budgetCents: integer("budget_cents").notNull().default(15000),
  totalEstimatedCostCents: integer("total_estimated_cost_cents").notNull().default(0),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const cartMealsTable = pgTable("cart_meals", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull(),
  mealId: integer("meal_id").notNull(),
});

export const cartItemsTable = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  totalQuantity: text("total_quantity").notNull().default("1"),
  unit: text("unit").notNull().default("each"),
  estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
});

export const mealCravingsTable = pgTable("meal_cravings", {
  id: serial("id").primaryKey(),
  mealName: text("meal_name").notNull(),
  source: text("source").notNull().default("jessica"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHealthQuestionSchema = createInsertSchema(healthQuestionsTable).omit({ id: true, createdAt: true });
export const insertCallSessionSchema = createInsertSchema(callSessionsTable).omit({ id: true });
export const insertHealthDataPointSchema = createInsertSchema(healthDataPointsTable).omit({ id: true, createdAt: true });
export const insertAppSettingSchema = createInsertSchema(appSettingsTable).omit({ id: true, updatedAt: true });

export type HealthQuestion = typeof healthQuestionsTable.$inferSelect;
export type CallSession = typeof callSessionsTable.$inferSelect;
export type HealthDataPoint = typeof healthDataPointsTable.$inferSelect;
export type AppSetting = typeof appSettingsTable.$inferSelect;
export type InsertHealthQuestion = z.infer<typeof insertHealthQuestionSchema>;
export type InsertCallSession = z.infer<typeof insertCallSessionSchema>;
export type InsertHealthDataPoint = z.infer<typeof insertHealthDataPointSchema>;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;

export const rotationTasksTable = pgTable("rotation_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  period: text("period").notNull().default("morning"),
  timeSlot: text("time_slot").notNull().default("8:00 AM"),
  isHourly: boolean("is_hourly").notNull().default(false),
  category: text("category").notNull().default("Physical Rotation"),
  status: text("status").notNull().default("pending"),
  medResponse: text("med_response"),
  loggedNote: text("logged_note"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const historicalCareLogsTable = pgTable("historical_care_logs", {
  id: serial("id").primaryKey(),
  dateLabel: text("date_label").notNull(),
  wantsRespondedRate: integer("wants_responded_rate").notNull().default(0),
  medAdherence: integer("med_adherence").notNull().default(0),
  soreRotationComplete: integer("sore_rotation_complete").notNull().default(0),
  generalNotes: text("general_notes"),
  efficacyScore: integer("efficacy_score").notNull().default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RotationTask = typeof rotationTasksTable.$inferSelect;
export type HistoricalCareLog = typeof historicalCareLogsTable.$inferSelect;

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("local"),
  itemName: text("item_name").notNull(),
  category: text("category").notNull().default("food"),
  replenishmentCycle: text("replenishment_cycle").notNull().default("weekly"),
  lastRestockedDate: date("last_restocked_date"),
  estimatedRunOutDate: date("estimated_run_out_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
