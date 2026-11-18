import { Router } from "express";
import { QuoteController } from "../controllers/quote.controller";
import { QuoteUseCase } from "../../application/use-cases/quote/quote.use-case";
import { QuoteRepository } from "../../infrastructure/repositories/quote.repository";
import { SupplierRepository } from "../../infrastructure/repositories/supplier.repository";
import { PdfExtractorService } from "../../infrastructure/services/pdf-extractor.service";
import { QuoteAiAnalyzerService } from "../../infrastructure/services/quote-ai-analyzer.service";
import { authenticate } from "../middlewares/auth.middleware";
import { uploadQuotePdf } from "../middlewares/upload.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import { aiAnalysisRateLimiter } from "../middlewares/rate-limit.middleware";
import { SaveQuoteSchema, AnalyzeQuotesSchema } from "../../application/dtos/quote.dto";

const router = Router();

// Dependency Injection
const pdfExtractorService = new PdfExtractorService();
const quoteAiAnalyzerService = new QuoteAiAnalyzerService();
const quoteRepository = new QuoteRepository();
const supplierRepository = new SupplierRepository();
const quoteUseCase = new QuoteUseCase(
  pdfExtractorService,
  quoteRepository,
  supplierRepository,
  quoteAiAnalyzerService
);
const quoteController = new QuoteController(quoteUseCase);

// All quote routes require authentication
router.use(authenticate);

// POST /api/v1/quotes/extract - Upload and extract quote PDF (Rate limited: 20 req / min)
router.post("/extract", aiAnalysisRateLimiter, uploadQuotePdf.single("file"), quoteController.extract);

// POST /api/v1/quotes/analyze - Intelligent AI Quotation Analysis & Strategic Sourcing (Rate limited: 20 req / min)
router.post("/analyze", aiAnalysisRateLimiter, validateRequest({ body: AnalyzeQuotesSchema }), quoteController.analyze);

// POST /api/v1/quotes - Save verified quotation
router.post("/", validateRequest({ body: SaveQuoteSchema }), quoteController.save);

// GET /api/v1/quotes - List quotes for organization
router.get("/", quoteController.list);

// GET /api/v1/quotes/:id - Get quote details
router.get("/:id", quoteController.getById);

// DELETE /api/v1/quotes/:id - Delete quotation and associated records
router.delete("/:id", quoteController.delete);

export { router as quoteRoutes };
