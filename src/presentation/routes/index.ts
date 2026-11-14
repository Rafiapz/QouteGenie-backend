import { Router } from "express";
import { healthRoutes } from "./health.routes";

const router = Router();

// Mount routes
router.use(healthRoutes);

export { router as apiRoutes };
