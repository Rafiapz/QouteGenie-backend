import { Request, Response, NextFunction } from "express";
import {
  DomainError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
} from "../../domain/errors/domain.error";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../../infrastructure/config/env.config";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "Validation failed",
      details: err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  // 2. Domain Not Found Error
  if (err instanceof NotFoundError) {
    res.status(404).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 3. Domain Validation Error
  if (err instanceof ValidationError) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 4. Domain Conflict Error
  if (err instanceof ConflictError) {
    res.status(409).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 5. Domain Unauthorized Error
  if (err instanceof UnauthorizedError) {
    res.status(401).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 6. Prisma Database Constraint Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        success: false,
        error: "An organization with this email address already exists.",
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        success: false,
        error: "Requested record was not found in the database.",
      });
      return;
    }
  }

  // 7. Generic Domain Error
  if (err instanceof DomainError) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  // 6. Unknown Internal Errors
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    ...(env.NODE_ENV === "development" && { message: err.message, stack: err.stack }),
  });
}
