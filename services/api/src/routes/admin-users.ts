import { Router } from "express";
import { z } from "zod";
import { ADMIN_ROLES, type AdminRole } from "@siemprebarato/shared";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../audit.js";
import { requireAdminSession } from "../middleware/admin-session.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireRole } from "../middleware/require-role.js";

const router = Router();
const managementRoles: AdminRole[] = ["super_admin", "admin"];
const writeRoles: AdminRole[] = ["super_admin"];

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const createSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(160),
  role: z.enum(ADMIN_ROLES),
});
const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(160).optional(),
  role: z.enum(ADMIN_ROLES).optional(),
  isActive: z.boolean().optional(),
});
const idSchema = z.string().uuid();

function mapUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
    googleLinked: Boolean(row.google_sub),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.use(requireAdminSession);

router.get("/", requireRole(managementRoles), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, display_name, role, is_active, google_sub, last_login_at, created_at, updated_at
       FROM admin_users
       ORDER BY is_active DESC, display_name ASC, email ASC`,
    );
    res.json({ success: true, users: result.rows.map(mapUser) });
  } catch (error) {
    console.error("Admin user list failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not load administrators." });
  }
});

router.post("/", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Check the email, name, and role." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT id FROM admin_users WHERE LOWER(email) = $1", [
      parsed.data.email,
    ]);
    if (existing.rowCount) {
      await client.query("ROLLBACK");
      res.status(409).json({ success: false, message: "This Google email is already registered." });
      return;
    }
    const inserted = await client.query(
      `INSERT INTO admin_users (email, display_name, role, is_active, created_by)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING id, email, display_name, role, is_active, google_sub, last_login_at, created_at, updated_at`,
      [parsed.data.email, parsed.data.displayName, parsed.data.role, req.adminSession?.user.id],
    );
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "admin_user.created",
      entityType: "admin_user",
      entityId: inserted.rows[0].id,
      details: { email: parsed.data.email, role: parsed.data.role },
    });
    await client.query("COMMIT");
    res.status(201).json({ success: true, user: mapUser(inserted.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin user creation failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not add the administrator." });
  } finally {
    client.release();
  }
});

router.patch("/:id", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  const parsedBody = updateSchema.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success || !Object.keys(parsedBody.data).length) {
    res.status(400).json({ success: false, message: "Invalid administrator update." });
    return;
  }
  if (parsedId.data === req.adminSession?.user.id && (parsedBody.data.isActive === false || parsedBody.data.role && parsedBody.data.role !== "super_admin")) {
    res.status(409).json({ success: false, message: "You cannot remove your own super administrator access." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{
      id: string;
      email: string;
      display_name: string;
      role: AdminRole;
      is_active: boolean;
    }>("SELECT id, email, display_name, role, is_active FROM admin_users WHERE id = $1 FOR UPDATE", [parsedId.data]);
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Administrator not found." });
      return;
    }

    const before = current.rows[0];
    const removesSuperAdmin =
      before.role === "super_admin" &&
      (parsedBody.data.role && parsedBody.data.role !== "super_admin" || parsedBody.data.isActive === false);
    if (removesSuperAdmin) {
      const activeSuperAdmins = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM admin_users WHERE role = 'super_admin' AND is_active = TRUE",
      );
      if (Number(activeSuperAdmins.rows[0].count) <= 1) {
        await client.query("ROLLBACK");
        res.status(409).json({ success: false, message: "At least one active super administrator is required." });
        return;
      }
    }

    const updated = await client.query(
      `UPDATE admin_users
       SET display_name = COALESCE($1, display_name),
           role = COALESCE($2, role),
           is_active = COALESCE($3, is_active)
       WHERE id = $4
       RETURNING id, email, display_name, role, is_active, google_sub, last_login_at, created_at, updated_at`,
      [parsedBody.data.displayName ?? null, parsedBody.data.role ?? null, parsedBody.data.isActive ?? null, parsedId.data],
    );
    if (parsedBody.data.isActive === false || parsedBody.data.role && parsedBody.data.role !== before.role) {
      await client.query(
        "UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_user_id = $1 AND revoked_at IS NULL",
        [parsedId.data],
      );
    }
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "admin_user.updated",
      entityType: "admin_user",
      entityId: parsedId.data,
      details: { before, changes: parsedBody.data },
    });
    await client.query("COMMIT");
    res.json({ success: true, user: mapUser(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Admin user update failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not update the administrator." });
  } finally {
    client.release();
  }
});

router.post("/:id/revoke-sessions", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Invalid administrator." });
    return;
  }
  if (parsedId.data === req.adminSession?.user.id) {
    res.status(409).json({ success: false, message: "Use sign out to close your own session." });
    return;
  }
  try {
    const result = await pool.query(
      `UPDATE admin_sessions
       SET revoked_at = NOW()
       WHERE admin_user_id = $1 AND revoked_at IS NULL`,
      [parsedId.data],
    );
    await recordAuditEvent(pool, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "admin_user.sessions_revoked",
      entityType: "admin_user",
      entityId: parsedId.data,
      details: { sessionCount: result.rowCount },
    });
    res.json({ success: true, revokedSessions: result.rowCount });
  } catch (error) {
    console.error("Session revocation failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not revoke sessions." });
  }
});

export default router;
