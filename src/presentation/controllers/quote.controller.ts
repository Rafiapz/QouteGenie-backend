import { Request, Response, NextFunction } from "express";
import { QuoteUseCase } from "../../application/use-cases/quote/quote.use-case";
import { UnauthorizedError, ValidationError } from "../../domain/errors/domain.error";

export class QuoteController {
  constructor(private readonly quoteUseCase: QuoteUseCase) {}

  extract = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      if (!req.file) {
        throw new ValidationError("Please upload a quotation PDF file.");
      }

      const extracted = await this.quoteUseCase.extractQuote(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.user.organizationId,
        req.user.plan
      );

      res.status(200).json({
        success: true,
        message: "Quotation PDF extracted successfully.",
        data: extracted,
      });
    } catch (error) {
      next(error);
    }
  };

  save = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const saved = await this.quoteUseCase.saveQuote(
        req.body,
        req.user.organizationId,
        req.user.plan
      );

      res.status(201).json({
        success: true,
        message: "Quotation saved successfully.",
        data: saved,
      });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const { search, supplier, sortBy } = req.query;

      const quotes = await this.quoteUseCase.getQuotes(req.user.organizationId, {
        search: typeof search === "string" ? search : undefined,
        supplier: typeof supplier === "string" ? supplier : undefined,
        sortBy: typeof sortBy === "string" ? (sortBy as any) : undefined,
      });

      res.status(200).json({
        success: true,
        message: "Quotations retrieved successfully.",
        data: quotes,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const quote = await this.quoteUseCase.getQuoteById(id, req.user.organizationId);

      res.status(200).json({
        success: true,
        data: quote,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await this.quoteUseCase.deleteQuote(id, req.user.organizationId);

      res.status(200).json({
        success: true,
        message: "Quotation deleted successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const quoteIds = Array.isArray(req.body.quoteIds) ? req.body.quoteIds : undefined;
      const forceRefresh = Boolean(req.body.forceRefresh);
      const analysis = await this.quoteUseCase.analyzeQuotes(
        quoteIds,
        req.user.organizationId,
        forceRefresh
      );

      res.status(200).json({
        success: true,
        message: "Intelligent quotation analysis generated successfully.",
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  };
}
