import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stateRouter from "./state";
import scheduleRouter from "./schedule";
import symptomsRouter from "./symptoms";
import scriptsRouter from "./scripts";
import haldolRouter from "./haldol";
import geminiRouter from "./gemini";
import smarthomeRouter from "./smarthome";
import intercomRouter from "./intercom";
import healthAssessmentRouter from "./health-assessment";
import shopperRouter from "./shopper";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stateRouter);
router.use(scheduleRouter);
router.use(symptomsRouter);
router.use(scriptsRouter);
router.use(haldolRouter);
router.use(geminiRouter);
router.use(smarthomeRouter);
router.use(intercomRouter);
router.use(healthAssessmentRouter);
router.use(shopperRouter);

export default router;
