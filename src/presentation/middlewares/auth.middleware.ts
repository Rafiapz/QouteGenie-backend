import { Request, Response, NextFunction } from "express";
import { JwtTokenService } from "../../infrastructure/security/JwtTokenService";
import { JwtUserPayload } from "../../infrastructure/security/ITokenService";
import { AUTH_COOKIE_NAME } from "../../infrastructure/security/cookie.config";
import { UnauthorizedError } from "../../domain/errors/domain.error";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

const tokenService = new JwtTokenService();

/**
 * Express middleware to authenticate incoming requests via JWT.
 * Extracts and verifies the token from:
 * 1. HTTP-Only Cookie ("token")
 * 2. Authorization header ("Bearer <token>")
 * Attaches the decoded JwtUserPayload to req.user.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  let token: string | undefined;

  // 1. Check HTTP-only cookie first
  if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    token = req.cookies[AUTH_COOKIE_NAME];
  }

  // 2. Fallback to Authorization: Bearer <token> header
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      token = parts[1];
    }
  }

  if (!token) {
    throw new UnauthorizedError(
      "Authentication required. No valid cookie or Bearer token provided."
    );
  }

  const decoded = tokenService.verifyToken(token);
  req.user = decoded;
  next();
}
