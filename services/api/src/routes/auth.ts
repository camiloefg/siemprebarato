import { Router } from "express";
import type { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../audit.js";
import { parseCookies } from "../security/cookies.js";
import { signOAuthState, verifyOAuthState } from "../security/oauth-state.js";
import { hashToken, randomToken } from "../security/tokens.js";
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  requireAdminSession,
} from "../middleware/admin-session.js";
import { requireCsrf } from "../middleware/csrf.js";

const router = Router();
const googleClient = new OAuth2Client(config.google.clientId);
const OAUTH_NONCE_COOKIE = "sb_oauth_nonce";

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function cookieSecurity() {
  return {
    secure: config.isProduction,
    sameSite: "lax" as const,
  };
}

function safeReturnTo(value: unknown): string {
  const candidate = String(value || "/").trim();
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
}

function adminRedirect(returnTo: string, params: Record<string, string>): string {
  const url = new URL(safeReturnTo(returnTo), config.adminAppUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function isLoopbackRequest(req: Request): boolean {
  const address = String(req.socket.remoteAddress || req.ip || "");
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function issueAdminSession(
  req: Request,
  res: Response,
  user: { id: string; email: string; display_name: string; role: string },
): Promise<void> {
  const sessionToken = randomToken(48);
  const csrfToken = randomToken(32);
  const sessionHash = hashToken(sessionToken, config.authSessionPepper, "admin-session");
  const csrfHash = hashToken(csrfToken, config.authSessionPepper, "admin-csrf");
  const expiresAt = new Date(Date.now() + config.adminSessionTtlMs);

  await pool.query(
    `INSERT INTO admin_sessions (
       admin_user_id, session_token_hash, csrf_token_hash, expires_at, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      user.id,
      sessionHash,
      csrfHash,
      expiresAt,
      req.ip || null,
      String(req.get("user-agent") || "").slice(0, 1000) || null,
    ],
  );

  res.cookie(ADMIN_SESSION_COOKIE, sessionToken, {
    ...cookieSecurity(),
    httpOnly: true,
    path: "/",
    maxAge: config.adminSessionTtlMs,
  });
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
    ...cookieSecurity(),
    httpOnly: false,
    path: "/",
    maxAge: config.adminSessionTtlMs,
  });
}

router.get("/config", (_req, res) => {
  res.json({
    success: true,
    googleConfigured: Boolean(config.google.clientId && config.google.clientSecret),
    developmentLoginEnabled: config.allowDevAuthBypass,
  });
});

router.get("/google/start", authLimiter, (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    res.redirect(adminRedirect("/login", { error: "google_not_configured" }));
    return;
  }

  const nonce = randomToken(24);
  const returnTo = safeReturnTo(req.query.returnTo);
  const state = signOAuthState({ nonce, returnTo, issuedAt: Date.now() }, config.oauthStateSecret);
  res.cookie(OAUTH_NONCE_COOKIE, nonce, {
    ...cookieSecurity(),
    httpOnly: true,
    path: "/api/auth/google",
    maxAge: 10 * 60 * 1000,
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", config.google.clientId);
  authUrl.searchParams.set("redirect_uri", config.google.callbackUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");
  res.redirect(authUrl.toString());
});

router.get("/google/callback", authLimiter, async (req, res) => {
  let returnTo = "/";
  try {
    const nonce = parseCookies(req)[OAUTH_NONCE_COOKIE] || "";
    const state = verifyOAuthState(String(req.query.state || ""), config.oauthStateSecret, nonce);
    returnTo = state.returnTo;
    res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/api/auth/google" });

    if (req.query.error || !req.query.code) {
      throw new Error(String(req.query.error_description || req.query.error || "Google authorization was cancelled."));
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    const tokenBody = (await tokenResponse.json()) as { id_token?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenBody.id_token) {
      throw new Error(tokenBody.error_description || "Google token exchange failed.");
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: tokenBody.id_token,
      audience: config.google.clientId,
    });
    const profile = ticket.getPayload();
    const email = String(profile?.email || "").trim().toLowerCase();
    if (!email || profile?.email_verified !== true || !profile?.sub) {
      throw new Error("Google did not provide a verified email address.");
    }

    const client = await pool.connect();
    let user: { id: string; email: string; display_name: string; role: string };
    try {
      await client.query("BEGIN");
      const result = await client.query<{
        id: string;
        email: string;
        display_name: string;
        role: string;
        google_sub: string | null;
        is_active: boolean;
      }>(
        `SELECT id, email, display_name, role, google_sub, is_active
         FROM admin_users
         WHERE LOWER(email) = $1
         FOR UPDATE`,
        [email],
      );
      if (!result.rowCount || !result.rows[0].is_active) {
        throw new Error("This Google account has not been invited to Siempre Barato.");
      }
      const found = result.rows[0];
      if (found.google_sub && found.google_sub !== profile.sub) {
        throw new Error("This email is already linked to a different Google identity.");
      }
      const displayName = found.display_name || String(profile.name || email.split("@")[0]);
      await client.query(
        `UPDATE admin_users
         SET google_sub = COALESCE(google_sub, $1),
             google_avatar_url = $2,
             display_name = CASE WHEN display_name = '' THEN $3 ELSE display_name END,
             last_login_at = NOW()
         WHERE id = $4`,
        [profile.sub, profile.picture || null, displayName, found.id],
      );
      await client.query("COMMIT");
      user = { ...found, display_name: displayName };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await issueAdminSession(req, res, user);
    await recordAuditEvent(pool, req, {
      actorAdminUserId: user.id,
      action: "auth.google_login",
      entityType: "admin_user",
      entityId: user.id,
      details: { email: user.email },
    });
    res.redirect(adminRedirect(returnTo, { login: "success" }));
  } catch (error) {
    console.error("Google login failed:", error instanceof Error ? error.message : error);
    res.clearCookie(OAUTH_NONCE_COOKIE, { path: "/api/auth/google" });
    res.redirect(adminRedirect("/login", { error: "google_login_failed" }));
  }
});

router.post("/dev-login", authLimiter, async (req, res) => {
  if (!config.allowDevAuthBypass || !isLoopbackRequest(req)) {
    res.status(404).json({ success: false, message: "Not found." });
    return;
  }

  const email = String(req.body?.email || config.bootstrapSuperAdminEmail).trim().toLowerCase();
  try {
    const result = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      is_active: boolean;
    }>(
      `SELECT id, email, display_name, role, is_active
       FROM admin_users
       WHERE LOWER(email) = $1`,
      [email],
    );
    if (!result.rowCount || !result.rows[0].is_active) {
      res.status(403).json({ success: false, message: "The local admin user is not active." });
      return;
    }
    const user = result.rows[0];
    await issueAdminSession(req, res, user);
    await pool.query("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", [user.id]);
    await recordAuditEvent(pool, req, {
      actorAdminUserId: user.id,
      action: "auth.development_login",
      entityType: "admin_user",
      entityId: user.id,
      details: { localOnly: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Development login failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Development login failed." });
  }
});

router.get("/session", requireAdminSession, (req, res) => {
  res.json({ success: true, user: req.adminSession?.user });
});

router.post("/logout", requireAdminSession, requireCsrf, async (req, res) => {
  try {
    await pool.query("UPDATE admin_sessions SET revoked_at = NOW() WHERE id = $1", [
      req.adminSession?.sessionId,
    ]);
    await recordAuditEvent(pool, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "auth.logout",
      entityType: "admin_session",
      entityId: req.adminSession?.sessionId,
    });
    res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
    res.clearCookie(ADMIN_CSRF_COOKIE, { path: "/" });
    res.json({ success: true });
  } catch (error) {
    console.error("Logout failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not close the session." });
  }
});

export default router;
