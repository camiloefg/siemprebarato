import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { parseCookies } from "../security/cookies.js";
import { hashToken, safeEqual } from "../security/tokens.js";
import { ADMIN_CSRF_COOKIE } from "./admin-session.js";

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const cookieToken = parseCookies(req)[ADMIN_CSRF_COOKIE] || "";
  const headerToken = String(req.get("x-csrf-token") || "");
  const expectedHash = req.adminSession?.csrfTokenHash || "";
  const providedHash = hashToken(headerToken, config.authSessionPepper, "admin-csrf");

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken) || !safeEqual(providedHash, expectedHash)) {
    res.status(403).json({ success: false, message: "Invalid CSRF token." });
    return;
  }

  next();
}
