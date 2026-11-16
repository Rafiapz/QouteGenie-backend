import { CookieOptions } from "express";
import { env } from "../config/env.config";

export const AUTH_COOKIE_NAME = "token";

/**
 * 1-day cookie options (24 hours in milliseconds).
 * httpOnly: true ensures the cookie cannot be accessed via client-side JavaScript (mitigating XSS).
 * sameSite: "lax" ensures the cookie is sent on cross-site requests like top-level navigation while protecting against CSRF.
 * secure: enabled in production so cookie is only transmitted over HTTPS.
 */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 24 * 60 * 60 * 1000, // 1 day
  path: "/",
};

export const clearAuthCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};
