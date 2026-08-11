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

const router: IRouter = Router();

// ─── PUBLIC ROUTES — no authentication required ──────────────────────────────
router.use(healthRouter);
router.use(tenantsRouter);   // /tenants/auth, /tenants/setup
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
coreRouter.use(adminRouter);            // no direct DB queries (AI proxy)
coreRouter.use(intakeRouter);           // no direct DB queries (AI proxy)
coreRouter.use(geminiRouter);           // no direct DB queries (AI proxy)

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
localRouter.use(authRouter);
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
