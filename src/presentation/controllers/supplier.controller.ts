import { Request, Response, NextFunction } from "express";
import { SupplierUseCase } from "../../application/use-cases/supplier/supplier.use-case";
import { UnauthorizedError } from "../../domain/errors/domain.error";

export class SupplierController {
  constructor(private readonly supplierUseCase: SupplierUseCase) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.organizationId) {
        throw new UnauthorizedError("Authentication required.");
      }

      const supplier = await this.supplierUseCase.createSupplier({
        ...req.body,
        organizationId: req.user.organizationId,
      });

      res.status(201).json({
        success: true,
        message: "Supplier created successfully.",
        data: supplier,
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

      const suppliers = await this.supplierUseCase.getSuppliers(req.user.organizationId);

      res.status(200).json({
        success: true,
        message: "Suppliers retrieved successfully.",
        data: suppliers,
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
      const supplier = await this.supplierUseCase.getSupplierById(
        id,
        req.user.organizationId
      );

      res.status(200).json({
        success: true,
        data: supplier,
      });
    } catch (error) {
      next(error);
    }
  };
}
