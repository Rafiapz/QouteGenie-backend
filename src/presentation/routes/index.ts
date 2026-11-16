import { Router } from "express";
import { healthRoutes } from "./health.routes";
import { organizationRoutes } from "./organization.routes";
import { supplierRoutes } from "./supplier.routes";
import { quoteRoutes } from "./quote.routes";
import { comparisonRoutes } from "./comparison.routes";

const router = Router();

// Mount routes
router.use(healthRoutes);
router.use("/organizations", organizationRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/quotes", quoteRoutes);
router.use("/comparisons", comparisonRoutes);

export { router as apiRoutes };
