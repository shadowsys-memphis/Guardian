import { Router, type IRouter } from "express";
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
import workspaceRouter from "./workspace";
import inventoryRouter from "./inventory";
import intakeRouter from "./intake";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stateRouter);
router.use(scheduleRouter);
router.use(symptomsRouter);
router.use(scriptsRouter);
router.use(haldolRouter);
router.use(geminiRouter);
router.use(smarthomeRouter);
router.use(healthAssessmentRouter);
router.use(shopperRouter);
router.use(rotationRouter);
router.use(adminRouter);
router.use(workspaceRouter);
router.use(inventoryRouter);
router.use(intakeRouter);

export default router;
