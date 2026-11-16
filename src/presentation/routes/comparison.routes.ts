import { Router } from "express";
import { ComparisonController } from "../controllers/comparison.controller";
import { ComparisonUseCase } from "../../application/use-cases/comparison/comparison.use-case";
import { ComparisonRepository } from "../../infrastructure/repositories/comparison.repository";
import { QuoteRepository } from "../../infrastructure/repositories/quote.repository";
import { QuoteAiAnalyzerService } from "../../infrastructure/services/quote-ai-analyzer.service";
import { authenticate } from "../middlewares/auth.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  aiAnalysisRateLimiter,
  comparisonRateLimiter,
} from "../middlewares/rate-limit.middleware";
import {
  CreateComparisonSchema,
  UpdateComparisonSchema,
} from "../../application/dtos/comparison.dto";

const router = Router();

const comparisonRepository = new ComparisonRepository();
const quoteRepository = new QuoteRepository();
const quoteAiAnalyzerService = new QuoteAiAnalyzerService();
const comparisonUseCase = new ComparisonUseCase(
  comparisonRepository,
  quoteRepository,
  quoteAiAnalyzerService
);
const comparisonController = new ComparisonController(comparisonUseCase);

// All comparison routes require authentication
router.use(authenticate);

// POST /api/v1/comparisons - Create comparison (Rate limited: 60 req / min)
router.post(
  "/",
  comparisonRateLimiter,
  validateRequest({ body: CreateComparisonSchema }),
  comparisonController.create
);

// GET /api/v1/comparisons - List comparisons
router.get("/", comparisonController.list);

// GET /api/v1/comparisons/:id - Get comparison by id
router.get("/:id", comparisonController.getById);

// POST /api/v1/comparisons/:id/analyze - Run AI analysis for a specific comparison (Rate limited: 20 req / min)
router.post("/:id/analyze", aiAnalysisRateLimiter, comparisonController.analyze);

// PUT /api/v1/comparisons/:id - Update comparison (Rate limited: 60 req / min)
router.put(
  "/:id",
  comparisonRateLimiter,
  validateRequest({ body: UpdateComparisonSchema }),
  comparisonController.update
);

// DELETE /api/v1/comparisons/:id - Delete comparison
router.delete("/:id", comparisonController.delete);

export { router as comparisonRoutes };
