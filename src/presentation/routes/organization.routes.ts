import { Router } from "express";
import { OrganizationRepository } from "../../infrastructure/repositories/organization.repository";
import { BcryptPasswordHasher } from "../../infrastructure/security/BcryptPasswordHasher";
import { JwtTokenService } from "../../infrastructure/security/JwtTokenService";
import { RegisterOrganizationUseCase } from "../../application/use-cases/organization/register-organization.use-case";
import { LoginOrganizationUseCase } from "../../application/use-cases/organization/login-organization.use-case";
import { OrganizationController } from "../controllers/organization.controller";
import { validateRequest } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { RegisterOrganizationSchema } from "../../application/dtos/register-organization.dto";
import { LoginOrganizationSchema } from "../../application/dtos/login-organization.dto";

const router = Router();

// Dependency Injection
const organizationRepository = new OrganizationRepository();
const passwordHasher = new BcryptPasswordHasher();
const tokenService = new JwtTokenService();

const registerOrganizationUseCase = new RegisterOrganizationUseCase(
  organizationRepository,
  passwordHasher,
  tokenService
);
const loginOrganizationUseCase = new LoginOrganizationUseCase(
  organizationRepository,
  passwordHasher,
  tokenService
);

const organizationController = new OrganizationController(
  registerOrganizationUseCase,
  loginOrganizationUseCase
);

// POST /api/v1/organizations/register
router.post(
  "/register",
  validateRequest({ body: RegisterOrganizationSchema }),
  organizationController.register
);

// POST /api/v1/organizations/login
router.post(
  "/login",
  validateRequest({ body: LoginOrganizationSchema }),
  organizationController.login
);

// POST /api/v1/organizations/logout (Clears the auth cookie)
router.post("/logout", organizationController.logout);

// GET /api/v1/organizations/me (Protected with JWT)
router.get("/me", authenticate, organizationController.getProfile);

export { router as organizationRoutes };
