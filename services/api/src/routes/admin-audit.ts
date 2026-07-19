import { Router } from "express";
import type { AdminRole } from "@siemprebarato/shared";
import { pool } from "../db/pool.js";
import { requireAdminSession } from "../middleware/admin-session.js";
import { requireRole } from "../middleware/require-role.js";

const router = Router();
const auditRoles: AdminRole[] = ["super_admin", "admin"];

router.get("/", requireAdminSession, requireRole(auditRoles), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         events.id,
         events.action,
         events.entity_type AS "entityType",
         events.entity_id AS "entityId",
         events.details,
         events.created_at AS "createdAt",
         users.email AS "actorEmail",
         users.display_name AS "actorName"
       FROM audit_events events
       LEFT JOIN admin_users users ON users.id = events.actor_admin_user_id
       ORDER BY events.created_at DESC
       LIMIT 100`,
    );
    res.json({ success: true, events: result.rows });
  } catch (error) {
    console.error("Audit log read failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not load the audit log." });
  }
});

export default router;
