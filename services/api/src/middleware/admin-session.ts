import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@siemprebarato/shared";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { parseCookies } from "../security/cookies.js";
import { hashToken } from "../security/tokens.js";

export const ADMIN_SESSION_COOKIE = "sb_admin_session";
export const ADMIN_CSRF_COOKIE = "sb_admin_csrf";

type SessionRow = {
  session_id: string;
  csrf_token_hash: string;
  user_id: string;
  email: string;
  display_name: string;
  role: AdminRole;
};

export async function requireAdminSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sessionToken = parseCookies(req)[ADMIN_SESSION_COOKIE];
  if (!sessionToken) {
    res.status(401).json({ success: false, message: "Authentication required." });
    return;
  }

  try {
    const sessionHash = hashToken(sessionToken, config.authSessionPepper, "admin-session");
    const result = await pool.query<SessionRow>(
      `SELECT
         sessions.id AS session_id,
         sessions.csrf_token_hash,
         users.id AS user_id,
         users.email,
         users.display_name,
         users.role
       FROM admin_sessions sessions
       JOIN admin_users users ON users.id = sessions.admin_user_id
       WHERE sessions.session_token_hash = $1
         AND sessions.revoked_at IS NULL
         AND sessions.expires_at > NOW()
         AND users.is_active = TRUE
       LIMIT 1`,
      [sessionHash],
    );

    if (!result.rowCount) {
      res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
      res.clearCookie(ADMIN_CSRF_COOKIE, { path: "/" });
      res.status(401).json({ success: false, message: "Session expired or revoked." });
      return;
    }

    const row = result.rows[0];
    req.adminSession = {
      sessionId: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
      },
    };

    void pool.query(
      `UPDATE admin_sessions
       SET last_seen_at = NOW()
       WHERE id = $1 AND last_seen_at < NOW() - INTERVAL '5 minutes'`,
      [row.session_id],
    );
    next();
  } catch (error) {
    console.error("Admin session validation failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not validate the session." });
  }
}
