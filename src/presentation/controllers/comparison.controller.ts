import { Request, Response, NextFunction } from "express";
import { ComparisonUseCase } from "../../application/use-cases/comparison/comparison.use-case";
import { UnauthorizedError } from "../../domain/errors/domain.error";

export class ComparisonController {
  constructor(private readonly comparisonUseCase: ComparisonUseCase) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const comparison = await this.comparisonUseCase.createComparison(
        req.user.organizationId,
        req.body
      );

      res.status(201).json({
        success: true,
        message: "Comparison saved successfully.",
        data: comparison,
      });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const comparisons = await this.comparisonUseCase.getComparisons(
        req.user.organizationId
      );

      res.status(200).json({
        success: true,
        message: "Comparisons retrieved successfully.",
        data: comparisons,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const comparison = await this.comparisonUseCase.getComparisonById(
        id,
        req.user.organizationId
      );

      res.status(200).json({
        success: true,
        message: "Comparison retrieved successfully.",
        data: comparison,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await this.comparisonUseCase.updateComparison(
        id,
        req.user.organizationId,
        req.body
      );

      res.status(200).json({
        success: true,
        message: "Comparison updated successfully.",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await this.comparisonUseCase.deleteComparison(id, req.user.organizationId);

      res.status(200).json({
        success: true,
        message: "Comparison deleted successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const forceRefresh = Boolean(req.body.forceRefresh);
      const quoteIds = Array.isArray(req.body.quoteIds) ? req.body.quoteIds : undefined;

      const analysis = await this.comparisonUseCase.analyzeComparison(
        id,
        req.user.organizationId,
        forceRefresh,
        quoteIds
      );

      res.status(200).json({
        success: true,
        message: "Comparison analysis generated successfully.",
        data: analysis,
      });
    } catch (error) {
      next(error);
    }
  };
}
