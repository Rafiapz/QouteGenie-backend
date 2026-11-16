import { Request, Response, NextFunction } from "express";
import { RegisterOrganizationUseCase } from "../../application/use-cases/organization/register-organization.use-case";
import { LoginOrganizationUseCase } from "../../application/use-cases/organization/login-organization.use-case";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
} from "../../infrastructure/security/cookie.config";

export class OrganizationController {
  constructor(
    private readonly registerOrganizationUseCase: RegisterOrganizationUseCase,
    private readonly loginOrganizationUseCase: LoginOrganizationUseCase
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.registerOrganizationUseCase.execute(req.body);

      // Save JWT token in HTTP-only 1-day cookie
      if (organization.token) {
        res.cookie(AUTH_COOKIE_NAME, organization.token, authCookieOptions);
      }

      res.status(201).json({
        success: true,
        message: "Organization registered successfully.",
        data: organization,
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organization = await this.loginOrganizationUseCase.execute(req.body);

      // Save JWT token in HTTP-only 1-day cookie
      if (organization.token) {
        res.cookie(AUTH_COOKIE_NAME, organization.token, authCookieOptions);
      }

      res.status(200).json({
        success: true,
        message: "Login successful.",
        data: organization,
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions);
      res.status(200).json({
        success: true,
        message: "Logged out successfully.",
      });
    } catch (error) {
      next(error);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(200).json({
        success: true,
        message: "Profile retrieved successfully.",
        data: req.user,
      });
    } catch (error) {
      next(error);
    }
  };
}
