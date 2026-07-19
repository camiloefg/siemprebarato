import type { Pool, PoolClient } from "pg";
import type { Request } from "express";

type AuditDatabase = Pick<Pool | PoolClient, "query">;

export async function recordAuditEvent(
  database: AuditDatabase,
  req: Request,
  event: {
    actorAdminUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await database.query(
    `INSERT INTO audit_events (
       actor_admin_user_id, action, entity_type, entity_id, details, ip_address, user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.actorAdminUserId || null,
      event.action,
      event.entityType,
      event.entityId || null,
      event.details || {},
      req.ip || null,
      String(req.get("user-agent") || "").slice(0, 1000) || null,
    ],
  );
}
