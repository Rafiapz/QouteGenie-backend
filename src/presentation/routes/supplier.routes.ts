import { Router } from "express";
import { SupplierRepository } from "../../infrastructure/repositories/supplier.repository";
import { SupplierUseCase } from "../../application/use-cases/supplier/supplier.use-case";
import { SupplierController } from "../controllers/supplier.controller";
import { validateRequest } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { CreateSupplierSchema } from "../../application/dtos/create-supplier.dto";

const router = Router();

// Dependency Injection
const supplierRepository = new SupplierRepository();
const supplierUseCase = new SupplierUseCase(supplierRepository);
const supplierController = new SupplierController(supplierUseCase);

// All supplier routes require authentication
router.use(authenticate);

// POST /api/v1/suppliers - Create a supplier for the authenticated organization
router.post(
  "/",
  validateRequest({ body: CreateSupplierSchema }),
  supplierController.create
);

// GET /api/v1/suppliers - List all suppliers for the authenticated organization
router.get("/", supplierController.list);

// GET /api/v1/suppliers/:id - Get a specific supplier by ID
router.get("/:id", supplierController.getById);

export { router as supplierRoutes };
