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
  doseMg: integer("dose_mg"),
  // Prescriber-set dosing interval. Default 14 preserves the historical
  // biweekly assumption; set per-cycle when the prescription changes.
  intervalDays: integer("interval_days").notNull().default(14),
  // Post-injection high-symptom window, in days from the injection.
  zombiePhaseDays: integer("zombie_phase_days").notNull().default(5),
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
  elevenlabsConversationId: text("elevenlabs_conversation_id"),
  // Whether this specific outbound call was actually answered/engaged with
  // (Pops spoke), not just dialed. Defaults true so historical rows (created
  // before this column existed) aren't retroactively flagged as missed; new
  // outbound-call rows explicitly start false until the webhook confirms it.
  reached: boolean("reached").notNull().default(true),
  transcript: text("transcript"),
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

export const medicalAppointmentsTable = pgTable("medical_appointments", {
  id: serial("id").primaryKey(),
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: text("appointment_time").notNull().default("09:00"),
  provider: text("provider").notNull(),
  location: text("location"),
  type: text("type").notNull().default("primary_care"),
  notes: text("notes"),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const medicationAdjustmentsTable = pgTable("medication_adjustments", {
  id: serial("id").primaryKey(),
  adjustmentDate: date("adjustment_date").notNull(),
  medication: text("medication").notNull().default("Haldol Decanoate"),
  previousDose: text("previous_dose"),
  newDose: text("new_dose").notNull(),
  reason: text("reason"),
  loggedBy: text("logged_by").notNull().default("Ray"),
  cycleResetDate: date("cycle_reset_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMedicalAppointmentSchema = createInsertSchema(medicalAppointmentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMedicationAdjustmentSchema = createInsertSchema(medicationAdjustmentsTable).omit({ id: true, createdAt: true });

export type MedicalAppointment = typeof medicalAppointmentsTable.$inferSelect;
export type MedicationAdjustment = typeof medicationAdjustmentsTable.$inferSelect;
export type InsertMedicalAppointment = z.infer<typeof insertMedicalAppointmentSchema>;
export type InsertMedicationAdjustment = z.infer<typeof insertMedicationAdjustmentSchema>;

export const cartFulfillmentsTable = pgTable("cart_fulfillments", {
  id: serial("id").primaryKey(),
  cartId: integer("cart_id").notNull(),
  store: text("store").notNull().default("walmart"),
  checkoutUrl: text("checkout_url"),
  totalEstimatedCents: integer("total_estimated_cents").notNull().default(0),
  itemsJson: text("items_json").notNull().default("[]"),
  overBudgetCount: integer("over_budget_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  fallbackMode: integer("fallback_mode").notNull().default(1),
  initiatedBy: text("initiated_by").notNull().default("ray"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CartFulfillment = typeof cartFulfillmentsTable.$inferSelect;

export const actionLogsTable = pgTable("action_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload").notNull().default("{}"),
  result: text("result").notNull().default("{}"),
  conversationId: integer("conversation_id"),
  dispatchedBy: text("dispatched_by").notNull().default("jessica"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActionLog = typeof actionLogsTable.$inferSelect;

export const medicationsTable = pgTable("medications", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  dose: text("dose").notNull(),
  frequency: text("frequency").notNull().default("daily"),
  timeOfDay: text("time_of_day").notNull().default("morning"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMedicationSchema = createInsertSchema(medicationsTable).omit({ id: true, createdAt: true });
export type Medication = typeof medicationsTable.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;

export const careEventsTable = pgTable("care_events", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("local"),
  source: text("source").notNull().default("jessica"),
  actor: text("actor").notNull().default("jessica"),
  eventType: text("event_type").notNull(),
  sessionId: integer("session_id"),
  taskId: integer("task_id"),
  medicationId: integer("medication_id"),
  severity: text("severity"),
  confidence: text("confidence"),
  payload: text("payload").notNull().default("{}"),
  context: text("context"),
  outcome: text("outcome").notNull().default("dispatched"),
  adminIntervention: boolean("admin_intervention").notNull().default(false),
  doctorRelevant: boolean("doctor_relevant").notNull().default(false),
  learningRelevant: boolean("learning_relevant").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CareEvent = typeof careEventsTable.$inferSelect;

export const medicalDocumentsTable = pgTable("medical_documents", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("local"),
  sourceLabel: text("source_label").notNull().default("Medical Document"),
  rawText: text("raw_text").notNull().default(""),
  structuredJson: text("structured_json").notNull().default("{}"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type MedicalDocument = typeof medicalDocumentsTable.$inferSelect;
