import { Request, Response, NextFunction } from "express";
import { redisClient } from "../../infrastructure/cache/redis.client";

export interface RateLimitOptions {
  /** Time window in seconds */
  windowSeconds: number;
  /** Maximum number of allowed requests in the window */
  maxRequests: number;
  /** Namespace prefix for Redis / cache key */
  prefix?: string;
  /** User-friendly error message when rate limit is exceeded */
  message?: string;
  /** Custom key generator (defaults to client IP or user org ID) */
  keyGenerator?: (req: Request) => string;
  /** Condition to bypass rate limiting */
  skip?: (req: Request) => boolean;
}

/**
 * Factory for creating distributed, Redis-backed rate limiting middleware
 * with automatic in-memory fallback and standard HTTP rate limit headers.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowSeconds,
    maxRequests,
    prefix = "rl:general",
    message,
    keyGenerator,
    skip,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (skip && skip(req)) {
      return next();
    }

    try {
      // Determine client identifier: authenticated org/user or IP
      let identifier: string;
      if (keyGenerator) {
        identifier = keyGenerator(req);
      } else if (req.user?.organizationId) {
        identifier = `org:${req.user.organizationId}`;
      } else {
        const forwarded = req.headers["x-forwarded-for"];
        const rawIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip;
        identifier = `ip:${rawIp || "unknown"}`;
      }

      const cacheKey = `${prefix}:${identifier}`;
      const result = await redisClient.checkRateLimit(cacheKey, maxRequests, windowSeconds);

      const resetTimestamp = Math.floor(Date.now() / 1000) + result.resetInSeconds;

      // Set standard RFC-compliant and legacy rate limit headers
      res.setHeader("RateLimit-Limit", maxRequests);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader("RateLimit-Reset", resetTimestamp);
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", resetTimestamp);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.resetInSeconds);
        res.status(429).json({
          success: false,
          error: "RATE_LIMIT_EXCEEDED",
          message:
            message ||
            `Too many requests. Rate limit of ${maxRequests} requests per ${Math.round(
              windowSeconds / 60
            )} min exceeded. Please retry in ${result.resetInSeconds} seconds.`,
          retryAfterSeconds: result.resetInSeconds,
        });
        return;
      }

      next();
    } catch (err) {
      // Fail-open strategy: rate limiter failure should never crash regular traffic
      console.warn("Rate limiter encountered an internal warning, passing request through:", err);
      next();
    }
  };
}

/**
 * Global API Rate Limiter:
 * 300 requests per 15 minutes per IP/Organization across standard endpoints.
 */
export const generalRateLimiter = createRateLimiter({
  windowSeconds: 15 * 60,
  maxRequests: 300,
  prefix: "rl:global",
  message: "API rate limit exceeded. Please slow down and try again later.",
});

/**
 * Authentication Rate Limiter:
 * 10 attempts per 15 minutes per IP for /login and /register to block brute-force.
 */
export const authRateLimiter = createRateLimiter({
  windowSeconds: 15 * 60,
  maxRequests: 10,
  prefix: "rl:auth",
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const rawIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip;
    const email = req.body?.email?.trim().toLowerCase() || "";
    return `auth:${rawIp}:${email}`;
  },
  message: "Too many authentication attempts. Please try again after 15 minutes.",
});

/**
 * AI & Heavy Compute Rate Limiter:
 * 20 operations per minute per Organization/IP for AI analysis and PDF OCR extraction.
 */
export const aiAnalysisRateLimiter = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 20,
  prefix: "rl:ai",
  message: "AI analysis quota reached for this minute. Please wait a moment before re-analyzing.",
});

/**
 * Comparison Management Rate Limiter:
 * 60 requests per minute for comparison projects creation/updates.
 */
export const comparisonRateLimiter = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 60,
  prefix: "rl:comp",
  message: "Too many comparison updates. Please wait a moment before trying again.",
});
