import { Router } from "express";
import { z } from "zod";
import type { AdminRole } from "@siemprebarato/shared";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../audit.js";
import { requireAdminSession } from "../middleware/admin-session.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireRole } from "../middleware/require-role.js";

const router = Router();
const readRoles: AdminRole[] = ["super_admin", "admin", "catalog_manager", "order_manager", "support", "viewer"];
const researchWriteRoles: AdminRole[] = ["super_admin", "admin", "catalog_manager"];
const settingsRoles: AdminRole[] = ["super_admin", "admin"];

const settingsSchema = z.object({
  isEnabled: z.boolean(),
  frequencyHours: z.number().int().min(1).max(168),
  scheduleHourLocal: z.number().int().min(0).max(23),
  categoryMode: z.enum(["all_leaf", "selected"]),
  selectedCategoryIds: z.array(z.string().trim().regex(/^MLC\d+$/)).max(5000),
  maxCategoriesPerRun: z.number().int().min(1).max(5000),
  requestDelayMs: z.number().int().min(100).max(10000),
  maxRetries: z.number().int().min(0).max(8),
  enrichDetails: z.boolean(),
  retentionDays: z.number().int().min(30).max(3650),
  termsAcknowledged: z.boolean(),
});
const manualRunSchema = z.object({
  categoryIds: z.array(z.string().trim().regex(/^MLC\d+$/)).max(5000).default([]),
  categoryLimit: z.number().int().min(1).max(5000).optional(),
});
const candidateSchema = z.object({
  status: z.enum(["unreviewed", "watchlist", "candidate", "dismissed"]),
  notes: z.string().trim().max(5000),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
});
const entityTypeSchema = z.enum(["ITEM", "PRODUCT", "USER_PRODUCT"]);
const entityIdSchema = z.string().trim().min(1).max(100);

function nextRunSql(): string {
  return `CASE
    WHEN $2 = 24 THEN
      CASE
        WHEN ((date_trunc('day', NOW() AT TIME ZONE timezone) + make_interval(hours => $3)) AT TIME ZONE timezone) > NOW()
          THEN ((date_trunc('day', NOW() AT TIME ZONE timezone) + make_interval(hours => $3)) AT TIME ZONE timezone)
        ELSE ((date_trunc('day', NOW() AT TIME ZONE timezone) + INTERVAL '1 day' + make_interval(hours => $3)) AT TIME ZONE timezone)
      END
    ELSE NOW() + make_interval(hours => $2)
  END`;
}

router.use(requireAdminSession, requireRole(readRoles));

router.get("/overview", async (_req, res) => {
  try {
    const [settings, counts, runs, heartbeat] = await Promise.all([
      pool.query(
        `SELECT site_id AS "siteId", is_enabled AS "isEnabled", frequency_hours AS "frequencyHours",
                schedule_hour_local AS "scheduleHourLocal", timezone, category_mode AS "categoryMode",
                selected_category_ids AS "selectedCategoryIds", max_categories_per_run AS "maxCategoriesPerRun",
                request_delay_ms AS "requestDelayMs", max_retries AS "maxRetries",
                enrich_details AS "enrichDetails", retention_days AS "retentionDays",
                terms_acknowledged_at AS "termsAcknowledgedAt", next_run_at AS "nextRunAt",
                last_completed_at AS "lastCompletedAt", updated_at AS "updatedAt"
           FROM mercadolibre_research_settings WHERE id = 1`,
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_leaf) ::INTEGER AS "leafCategories",
           COUNT(*) FILTER (WHERE is_leaf AND is_enabled) ::INTEGER AS "enabledLeafCategories",
           (SELECT COUNT(*)::INTEGER FROM mercadolibre_research_snapshots) AS snapshots,
           (SELECT COUNT(*)::INTEGER FROM mercadolibre_research_candidates WHERE status IN ('watchlist', 'candidate')) AS "activeCandidates"
         FROM mercadolibre_research_categories`,
      ),
      pool.query(
        `SELECT id, trigger_type AS "triggerType", status, categories_requested AS "categoriesRequested",
                categories_processed AS "categoriesProcessed", categories_ranked AS "categoriesRanked",
                categories_without_ranking AS "categoriesWithoutRanking", categories_failed AS "categoriesFailed",
                snapshots_created AS "snapshotsCreated", error_summary AS "errorSummary",
                started_at AS "startedAt", finished_at AS "finishedAt", created_at AS "createdAt"
           FROM mercadolibre_research_runs ORDER BY created_at DESC LIMIT 12`,
      ),
      pool.query(
        `SELECT status, details, last_seen_at AS "lastSeenAt"
           FROM worker_heartbeats WHERE worker_name = 'mercadolibre-research'`,
      ),
    ]);
    res.json({
      success: true,
      settings: settings.rows[0],
      counts: counts.rows[0],
      runs: runs.rows,
      worker: heartbeat.rows[0] || null,
      connection: {
        workerEnabled: config.mercadoLibre.workerEnabled,
        accessTokenConfigured: config.mercadoLibre.accessTokenConfigured,
        ready:
          config.mercadoLibre.workerEnabled &&
          config.mercadoLibre.accessTokenConfigured &&
          Boolean(settings.rows[0]?.isEnabled) &&
          Boolean(settings.rows[0]?.termsAcknowledgedAt),
      },
    });
  } catch (error) {
    console.error("Research overview failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo cargar la investigación." });
  }
});

router.get("/categories", async (req, res) => {
  const search = String(req.query.search || "").trim().slice(0, 120);
  try {
    const result = await pool.query(
      `SELECT category_id AS "categoryId", name, parent_id AS "parentId", path_from_root AS "pathFromRoot",
              source_item_count AS "sourceItemCount", last_checked_at AS "lastCheckedAt",
              last_ranked_at AS "lastRankedAt", consecutive_no_ranking AS "consecutiveNoRanking"
         FROM mercadolibre_research_categories
        WHERE is_leaf = TRUE AND ($1 = '' OR name ILIKE '%' || $1 || '%' OR category_id ILIKE '%' || $1 || '%')
        ORDER BY name, category_id LIMIT 300`,
      [search],
    );
    res.json({ success: true, categories: result.rows });
  } catch (error) {
    console.error("Research categories failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudieron cargar las categorías." });
  }
});

router.get("/rankings", async (req, res) => {
  const categoryId = String(req.query.categoryId || "").trim();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const candidateStatus = String(req.query.candidateStatus || "").trim();
  const dateFrom = String(req.query.dateFrom || "").trim();
  const dateTo = String(req.query.dateTo || "").trim();
  const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  if ((categoryId && !/^MLC\d+$/.test(categoryId)) ||
      (candidateStatus && !["unreviewed", "watchlist", "candidate", "dismissed"].includes(candidateStatus)) ||
      !validDate(dateFrom) || !validDate(dateTo) || dateFrom && dateTo && dateFrom > dateTo) {
    res.status(400).json({ success: false, message: "Los filtros de investigación no son válidos." });
    return;
  }
  const parsedPage = Number.parseInt(String(req.query.page || "1"), 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.min(parsedPage, 10000) : 1;
  const limit = 50;
  try {
    const params = [categoryId, search, candidateStatus, dateFrom, dateTo, limit, (page - 1) * limit];
    const rows = await pool.query(
      `SELECT snapshots.id, snapshots.run_id AS "runId", snapshots.category_id AS "categoryId",
              categories.name AS "categoryName", snapshots.captured_at AS "capturedAt",
              snapshots.rank_position AS "rankPosition", snapshots.entity_type AS "entityType",
              snapshots.entity_id AS "entityId", snapshots.title, snapshots.permalink,
              snapshots.image_url AS "imageUrl", snapshots.price, snapshots.currency_id AS "currencyId",
              snapshots.brand, snapshots.detail_status AS "detailStatus",
              COALESCE(candidates.status, 'unreviewed') AS "candidateStatus",
              COALESCE(candidates.notes, '') AS notes, COALESCE(candidates.tags, ARRAY[]::TEXT[]) AS tags
         FROM mercadolibre_research_snapshots snapshots
         JOIN mercadolibre_research_categories categories ON categories.category_id = snapshots.category_id
         LEFT JOIN mercadolibre_research_candidates candidates
           ON candidates.entity_type = snapshots.entity_type AND candidates.entity_id = snapshots.entity_id
        WHERE ($1 = '' OR snapshots.category_id = $1)
          AND ($2 = '' OR snapshots.title ILIKE '%' || $2 || '%' OR snapshots.entity_id ILIKE '%' || $2 || '%')
          AND ($3 = '' OR COALESCE(candidates.status, 'unreviewed') = $3)
          AND ($4 = '' OR snapshots.captured_at >= $4::DATE)
          AND ($5 = '' OR snapshots.captured_at < $5::DATE + INTERVAL '1 day')
        ORDER BY snapshots.captured_at DESC, snapshots.category_id, snapshots.rank_position
        LIMIT $6 OFFSET $7`,
      params,
    );
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
         FROM mercadolibre_research_snapshots snapshots
         LEFT JOIN mercadolibre_research_candidates candidates
           ON candidates.entity_type = snapshots.entity_type AND candidates.entity_id = snapshots.entity_id
        WHERE ($1 = '' OR snapshots.category_id = $1)
          AND ($2 = '' OR snapshots.title ILIKE '%' || $2 || '%' OR snapshots.entity_id ILIKE '%' || $2 || '%')
          AND ($3 = '' OR COALESCE(candidates.status, 'unreviewed') = $3)
          AND ($4 = '' OR snapshots.captured_at >= $4::DATE)
          AND ($5 = '' OR snapshots.captured_at < $5::DATE + INTERVAL '1 day')`,
      params.slice(0, 5),
    );
    res.json({ success: true, rankings: rows.rows, page, total: Number(count.rows[0].count), pageSize: limit });
  } catch (error) {
    console.error("Research rankings failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudieron cargar los rankings." });
  }
});

router.put("/settings", requireCsrf, requireRole(settingsRoles), async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Revisa la configuración de investigación." });
    return;
  }
  if (parsed.data.isEnabled && !parsed.data.termsAcknowledged) {
    res.status(409).json({ success: false, message: "Debes confirmar los términos antes de habilitar la sincronización." });
    return;
  }
  if (parsed.data.categoryMode === "selected" && !parsed.data.selectedCategoryIds.length) {
    res.status(409).json({ success: false, message: "Selecciona al menos una categoría." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE mercadolibre_research_settings SET
         is_enabled = $1, frequency_hours = $2, schedule_hour_local = $3::INTEGER, category_mode = $4,
         selected_category_ids = $5, max_categories_per_run = $6, request_delay_ms = $7,
         max_retries = $8, enrich_details = $9, retention_days = $10,
         terms_acknowledged_at = CASE WHEN $11 THEN COALESCE(terms_acknowledged_at, NOW()) ELSE NULL END,
         terms_acknowledged_by = CASE WHEN $11 THEN COALESCE(terms_acknowledged_by, $12) ELSE NULL END,
         updated_by = $12,
         next_run_at = CASE WHEN $1 THEN ${nextRunSql()} ELSE NULL END
       WHERE id = 1
       RETURNING updated_at AS "updatedAt", next_run_at AS "nextRunAt"`,
      [parsed.data.isEnabled, parsed.data.frequencyHours, parsed.data.scheduleHourLocal,
        parsed.data.categoryMode, parsed.data.selectedCategoryIds, parsed.data.maxCategoriesPerRun,
        parsed.data.requestDelayMs, parsed.data.maxRetries, parsed.data.enrichDetails,
        parsed.data.retentionDays, parsed.data.termsAcknowledged, req.adminSession?.user.id],
    );
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "mercadolibre_research.settings_updated",
      entityType: "mercadolibre_research_settings",
      entityId: "1",
      details: { ...parsed.data, selectedCategoryIds: parsed.data.selectedCategoryIds.slice(0, 50) },
    });
    await client.query("COMMIT");
    res.json({ success: true, ...updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Research settings update failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo guardar la configuración." });
  } finally {
    client.release();
  }
});

router.post("/runs", requireCsrf, requireRole(settingsRoles), async (req, res) => {
  const parsed = manualRunSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "La ejecución solicitada no es válida." });
    return;
  }
  const readiness = await pool.query<{ isEnabled: boolean; acknowledged: boolean }>(
    `SELECT is_enabled AS "isEnabled", terms_acknowledged_at IS NOT NULL AS acknowledged
       FROM mercadolibre_research_settings WHERE id = 1`,
  );
  if (!config.mercadoLibre.workerEnabled || !config.mercadoLibre.accessTokenConfigured || !readiness.rows[0]?.isEnabled || !readiness.rows[0]?.acknowledged) {
    res.status(409).json({ success: false, message: "Completa credenciales, términos y habilitación antes de ejecutar." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO mercadolibre_research_runs
         (trigger_type, requested_category_ids, category_limit, requested_by)
       VALUES ('manual', $1, $2, $3) RETURNING id`,
      [parsed.data.categoryIds, parsed.data.categoryLimit || null, req.adminSession?.user.id],
    );
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "mercadolibre_research.run_queued",
      entityType: "mercadolibre_research_run",
      entityId: inserted.rows[0].id,
      details: { categoryCount: parsed.data.categoryIds.length, categoryLimit: parsed.data.categoryLimit || null },
    });
    await client.query("COMMIT");
    res.status(201).json({ success: true, runId: inserted.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      res.status(409).json({ success: false, message: "Ya hay una ejecución pendiente o activa." });
      return;
    }
    console.error("Research run enqueue failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo iniciar la investigación." });
  } finally {
    client.release();
  }
});

router.patch("/candidates/:entityType/:entityId", requireCsrf, requireRole(researchWriteRoles), async (req, res) => {
  const parsedType = entityTypeSchema.safeParse(req.params.entityType);
  const parsedId = entityIdSchema.safeParse(req.params.entityId);
  const parsedBody = candidateSchema.safeParse(req.body);
  if (!parsedType.success || !parsedId.success || !parsedBody.success) {
    res.status(400).json({ success: false, message: "Revisa la evaluación del candidato." });
    return;
  }
  const exists = await pool.query(
    `SELECT 1 FROM mercadolibre_research_snapshots WHERE entity_type = $1 AND entity_id = $2 LIMIT 1`,
    [parsedType.data, parsedId.data],
  );
  if (!exists.rowCount) {
    res.status(404).json({ success: false, message: "El registro de investigación no existe." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `INSERT INTO mercadolibre_research_candidates (entity_type, entity_id, status, notes, tags, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (entity_type, entity_id) DO UPDATE SET
         status = EXCLUDED.status, notes = EXCLUDED.notes, tags = EXCLUDED.tags, updated_by = EXCLUDED.updated_by
       RETURNING status, notes, tags, updated_at AS "updatedAt"`,
      [parsedType.data, parsedId.data, parsedBody.data.status, parsedBody.data.notes,
        [...new Set(parsedBody.data.tags.map((tag) => tag.toLowerCase()))], req.adminSession?.user.id],
    );
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "mercadolibre_research.candidate_updated",
      entityType: "mercadolibre_research_candidate",
      entityId: `${parsedType.data}:${parsedId.data}`,
      details: { status: parsedBody.data.status, tags: parsedBody.data.tags },
    });
    await client.query("COMMIT");
    res.json({ success: true, candidate: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Research candidate update failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo guardar la evaluación." });
  } finally {
    client.release();
  }
});

export default router;
