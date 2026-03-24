import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stateRouter from "./state";
import scheduleRouter from "./schedule";
import symptomsRouter from "./symptoms";
import scriptsRouter from "./scripts";
import haldolRouter from "./haldol";
import governorRouter from "./governor";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stateRouter);
router.use(scheduleRouter);
router.use(symptomsRouter);
router.use(scriptsRouter);
router.use(haldolRouter);
router.use(governorRouter);

export default router;
