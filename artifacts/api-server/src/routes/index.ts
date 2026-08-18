import { Router, type IRouter } from "express";
import { requireAnySession, requireLocalSession } from "../middlewares/tenant-auth";

import healthRouter from "./health";
import stateRouter from "./state";
import scheduleRouter from "./schedule";
import symptomsRouter from "./symptoms";
import scriptsRouter from "./scripts";
import haldolRouter from "./haldol";
import geminiRouter from "./gemini";
import smarthomeRouter from "./smarthome";
import healthAssessmentRouter from "./health-assessment";
import shopperRouter from "./shopper";
import rotationRouter from "./rotation";
import adminRouter from "./admin";
import workspaceRouteHandler from "./workspace";
import inventoryRouter from "./inventory";
import intakeRouter from "./intake";
import tenantsRouter from "./tenants";
import appointmentsRouter from "./appointments";
import reportsRouter from "./reports";
import actionsRouter from "./actions";
import medicationsRouter from "./medications";
import authRouter from "./auth";
import jessicaRouter from "./jessica";
import documentsRouter from "./documents";
import cronRouter from "./cron";
import labsRouter from "./labs";
import dayTypesRouter from "./day-types";
import touchpointsRouter from "./touchpoints";

const router: IRouter = Router();

// ─── PUBLIC ROUTES — no authentication required ──────────────────────────────
router.use(healthRouter);
router.use(tenantsRouter);   // /tenants/auth, /tenants/demo (no-passphrase demo session), /tenants/setup
router.use(jessicaRouter);   // jessica public: /jessica/elevenlabs-webhook
                              // jessica private: /jessica/outbound-call, /jessica/call-status/:id
                              // carry inline requireLocalSession.

// ─── CORE WORKSPACE — any valid session (local or tenant) ────────────────────
// These routes enforce tenant_id scoping on every DB query, resolving the
// tenant identifier exclusively from req.tenantSession (never client-supplied).
// local sessions: tenantId = "local" (Ray's personal workspace)
// tenant sessions: tenantId = session.sub (paying subscriber's UUID)
const coreRouter: IRouter = Router();
coreRouter.use(requireAnySession);
coreRouter.use(stateRouter);
coreRouter.use(scheduleRouter);
coreRouter.use(symptomsRouter);
coreRouter.use(inventoryRouter);
coreRouter.use(labsRouter);             // blood-work tracker, tenant-scoped from day one
coreRouter.use(dayTypesRouter);         // day_types table carries tenant_id, scoped from day one

router.use(coreRouter);

// ─── LOCAL-ONLY ROUTES — Ray's personal care tools, not yet tenant-scoped ───
// These routes have DB tables without tenant_id columns. They are intentionally
// restricted to local sessions until they are migrated to multi-tenant.
const localRouter: IRouter = Router();
localRouter.use(requireLocalSession);
localRouter.use(scriptsRouter);
localRouter.use(haldolRouter);
localRouter.use(smarthomeRouter);
localRouter.use(healthAssessmentRouter);
localRouter.use(shopperRouter);
localRouter.use(rotationRouter);
localRouter.use(appointmentsRouter);
localRouter.use(reportsRouter);
localRouter.use(actionsRouter);
localRouter.use(medicationsRouter);
localRouter.use(documentsRouter);
localRouter.use(cronRouter);
localRouter.use(touchpointsRouter);   // Jessica's daily touchpoint calls + the global call test-mode switch
localRouter.use(authRouter);
localRouter.use(adminRouter);           // /admin/summary (reads Ray's real haldolCycleTable)
                                         // and /assistant (unmetered billed Gemini call)
localRouter.use(intakeRouter);          // /intake/image, /intake/vision — unmetered billed
                                         // Gemini vision calls, same reasoning as adminRouter
// conversations/messages/call_sessions/health_data_points/meal_cravings have
// no tenant_id column and every gemini.ts query reads/writes them globally
// (including loadLiveContext(), which pulls schedule/symptom/meal/cart rows
// with no tenant filter at all) — a tenant or demo session must never reach
// these routes, or it can read or delete Ray's real AI conversation history.
localRouter.use(geminiRouter);
// Google Calendar/Drive via the workspace's managed Replit connector — this
// is Ray's own connected Google account, a single workspace-owner-level
// credential with no per-tenant isolation (see workspace.ts: it calls
// connectors.proxy(...) directly, with no caller-supplied credential). It
// must stay local-only: mounting it under the tenant-accessible core router
// would let any paying tenant create events on, or export arbitrary content
// to, Ray's personal Google account.
localRouter.use(workspaceRouteHandler);  // no direct DB queries (proxy)

router.use(localRouter);

export default router;
