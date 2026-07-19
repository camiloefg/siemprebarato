import type { Pool, PoolClient } from "pg";

export type MercadoLibreEntityType = "ITEM" | "PRODUCT" | "USER_PRODUCT";

export interface ResearchSettings {
  siteId: "MLC";
  isEnabled: boolean;
  frequencyHours: number;
  categoryMode: "all_leaf" | "selected";
  selectedCategoryIds: string[];
  maxCategoriesPerRun: number;
  requestDelayMs: number;
  maxRetries: number;
  enrichDetails: boolean;
  retentionDays: number;
  termsAcknowledgedAt: Date | null;
}

export interface ResearchCategory {
  id: string;
  name: string;
  parentId: string | null;
  pathFromRoot: Array<{ id: string; name: string }>;
  isLeaf: boolean;
  itemCount: number | null;
  raw: Record<string, unknown>;
}

export interface Highlight {
  id: string;
  position: number;
  type: MercadoLibreEntityType;
  raw: Record<string, unknown>;
}

export interface DetailSummary {
  title: string | null;
  permalink: string | null;
  imageUrl: string | null;
  price: number | null;
  currencyId: string | null;
  brand: string | null;
  attributes: unknown[];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function flattenCategoryTree(payload: unknown): ResearchCategory[] {
  const rootRecord = recordValue(payload);
  const roots = Array.isArray(payload)
    ? payload
    : arrayValue(rootRecord?.categories ?? rootRecord?.children_categories);
  const result: ResearchCategory[] = [];

  const visit = (value: unknown, parentId: string | null, inheritedPath: ResearchCategory["pathFromRoot"]): void => {
    const category = recordValue(value);
    if (!category) return;
    const id = stringValue(category.id);
    const name = stringValue(category.name);
    if (!id || !name) return;

    const children = arrayValue(category.children_categories ?? category.children);
    const explicitPath = arrayValue(category.path_from_root)
      .map((part) => recordValue(part))
      .filter((part): part is Record<string, unknown> => Boolean(part))
      .map((part) => ({ id: stringValue(part.id) || "", name: stringValue(part.name) || "" }))
      .filter((part) => part.id && part.name);
    const pathFromRoot = explicitPath.length
      ? explicitPath
      : [...inheritedPath, { id, name }];

    const rawWithoutChildren = { ...category };
    delete rawWithoutChildren.children_categories;
    delete rawWithoutChildren.children;
    result.push({
      id,
      name,
      parentId,
      pathFromRoot,
      isLeaf: children.length === 0,
      itemCount: numberValue(category.total_items_in_this_category ?? category.total_items),
      raw: rawWithoutChildren,
    });
    for (const child of children) visit(child, id, pathFromRoot);
  };

  for (const root of roots) visit(root, null, []);
  return result;
}

export function parseHighlights(payload: unknown): Highlight[] {
  const payloadRecord = recordValue(payload);
  const rows = Array.isArray(payload) ? payload : arrayValue(payloadRecord?.content);
  const seenPositions = new Set<number>();
  const seenEntities = new Set<string>();
  const result: Highlight[] = [];

  for (const value of rows) {
    const row = recordValue(value);
    if (!row) continue;
    const id = stringValue(row.id);
    const position = numberValue(row.position);
    const type = stringValue(row.type)?.toUpperCase();
    if (!id || !position || position < 1 || position > 20) continue;
    if (type !== "ITEM" && type !== "PRODUCT" && type !== "USER_PRODUCT") continue;
    const entityKey = `${type}:${id}`;
    if (seenPositions.has(position) || seenEntities.has(entityKey)) continue;
    seenPositions.add(position);
    seenEntities.add(entityKey);
    result.push({ id, position, type, raw: row });
  }
  return result.sort((a, b) => a.position - b.position);
}

export function summarizeDetail(payload: unknown): DetailSummary {
  const root = recordValue(payload) || {};
  const buyBox = recordValue(root.buy_box_winner) || {};
  const attributes = arrayValue(root.attributes).length
    ? arrayValue(root.attributes)
    : arrayValue(buyBox.attributes);
  const brandAttribute = attributes
    .map((attribute) => recordValue(attribute))
    .find((attribute) => stringValue(attribute?.id)?.toUpperCase() === "BRAND");
  const pictures = arrayValue(root.pictures);
  const firstPicture = recordValue(pictures[0]);

  return {
    title: stringValue(root.title) || stringValue(root.name) || stringValue(root.family_name),
    permalink: stringValue(root.permalink) || stringValue(buyBox.permalink),
    imageUrl:
      stringValue(root.thumbnail) ||
      stringValue(root.secure_thumbnail) ||
      stringValue(firstPicture?.secure_url) ||
      stringValue(firstPicture?.url),
    price: numberValue(root.price) ?? numberValue(buyBox.price),
    currencyId: stringValue(root.currency_id) || stringValue(buyBox.currency_id),
    brand: stringValue(brandAttribute?.value_name) || stringValue(root.brand),
    attributes,
  };
}

export function detailPath(type: MercadoLibreEntityType, id: string): string {
  const encodedId = encodeURIComponent(id);
  if (type === "ITEM") return `/items/${encodedId}`;
  if (type === "PRODUCT") return `/products/${encodedId}`;
  return `/user-products/${encodedId}`;
}

class MercadoLibreHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class MercadoLibreClient {
  private lastRequestAt = 0;

  constructor(
    private readonly options: {
      baseUrl: string;
      accessToken: string;
      requestDelayMs: number;
      maxRetries: number;
      fetchImpl?: typeof fetch;
      sleepImpl?: (milliseconds: number) => Promise<void>;
    },
  ) {}

  async get(path: string): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl || fetch;
    const sleep = this.options.sleepImpl || ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    let attempt = 0;

    while (true) {
      const remainingDelay = this.options.requestDelayMs - (Date.now() - this.lastRequestAt);
      if (remainingDelay > 0) await sleep(remainingDelay);
      this.lastRequestAt = Date.now();

      try {
        const response = await fetchImpl(`${this.options.baseUrl}${path}`, {
          headers: { authorization: `Bearer ${this.options.accessToken}`, accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        });
        const body = await response.json().catch(() => null);
        if (response.ok) return body;
        const message = stringValue(recordValue(body)?.message) || `Mercado Libre returned HTTP ${response.status}.`;
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          throw new MercadoLibreHttpError(response.status, message);
        }
        if ((response.status === 429 || response.status >= 500) && attempt < this.options.maxRetries) {
          attempt += 1;
          await sleep(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
          continue;
        }
        throw new MercadoLibreHttpError(response.status, message);
      } catch (error) {
        if (error instanceof MercadoLibreHttpError) throw error;
        if (attempt >= this.options.maxRetries) throw error;
        attempt += 1;
        await sleep(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
      }
    }
  }
}

async function loadSettings(pool: Pool): Promise<ResearchSettings> {
  const result = await pool.query<ResearchSettings>(
    `SELECT site_id AS "siteId", is_enabled AS "isEnabled", frequency_hours AS "frequencyHours",
            category_mode AS "categoryMode", selected_category_ids AS "selectedCategoryIds",
            max_categories_per_run AS "maxCategoriesPerRun", request_delay_ms AS "requestDelayMs",
            max_retries AS "maxRetries", enrich_details AS "enrichDetails", retention_days AS "retentionDays",
            terms_acknowledged_at AS "termsAcknowledgedAt"
       FROM mercadolibre_research_settings WHERE id = 1`,
  );
  if (!result.rows[0]) throw new Error("Mercado Libre research settings are missing.");
  return result.rows[0];
}

async function synchronizeCategories(pool: Pool, client: MercadoLibreClient, siteId: string): Promise<number> {
  const payload = await client.get(`/sites/${encodeURIComponent(siteId)}/categories/all`);
  const categories = flattenCategoryTree(payload);
  if (!categories.length) throw new Error("Mercado Libre category dump did not contain categories.");

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const category of categories) {
      await db.query(
        `INSERT INTO mercadolibre_research_categories
           (category_id, site_id, name, parent_id, path_from_root, is_leaf, source_item_count, raw_category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (category_id) DO UPDATE SET
           name = EXCLUDED.name,
           parent_id = EXCLUDED.parent_id,
           path_from_root = EXCLUDED.path_from_root,
           is_leaf = EXCLUDED.is_leaf,
           source_item_count = EXCLUDED.source_item_count,
           raw_category = EXCLUDED.raw_category,
           last_seen_at = NOW()`,
        [category.id, siteId, category.name, category.parentId, JSON.stringify(category.pathFromRoot), category.isLeaf, category.itemCount, JSON.stringify(category.raw)],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
  return categories.length;
}

async function claimRun(pool: Pool, workerId: string): Promise<{ id: string; requestedCategoryIds: string[]; categoryLimit: number | null } | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string; requestedCategoryIds: string[]; categoryLimit: number | null }>(
      `SELECT id, requested_category_ids AS "requestedCategoryIds", category_limit AS "categoryLimit"
         FROM mercadolibre_research_runs
        WHERE status = 'queued' OR (status = 'running' AND lease_until < NOW())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    const run = result.rows[0];
    if (run) {
      await client.query(
        `UPDATE mercadolibre_research_runs
            SET status = 'running', worker_id = $2, lease_until = NOW() + INTERVAL '10 minutes',
                started_at = COALESCE(started_at, NOW()), error_summary = NULL
          WHERE id = $1`,
        [run.id, workerId],
      );
    }
    await client.query("COMMIT");
    return run || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function chooseCategories(pool: Pool, settings: ResearchSettings, run: { requestedCategoryIds: string[]; categoryLimit: number | null }) {
  const requested = run.requestedCategoryIds || [];
  const selected = requested.length ? requested : settings.categoryMode === "selected" ? settings.selectedCategoryIds : [];
  const limit = Math.min(run.categoryLimit || settings.maxCategoriesPerRun, settings.maxCategoriesPerRun);
  const result = await pool.query<{ categoryId: string }>(
    `SELECT category_id AS "categoryId"
       FROM mercadolibre_research_categories
      WHERE is_leaf = TRUE AND is_enabled = TRUE
        AND (cardinality($1::TEXT[]) = 0 OR category_id = ANY($1::TEXT[]))
      ORDER BY last_checked_at ASC NULLS FIRST, category_id
      LIMIT $2`,
    [selected, limit],
  );
  return result.rows.map((row) => row.categoryId);
}

async function storeCategorySnapshots(
  db: PoolClient,
  runId: string,
  categoryId: string,
  highlights: Highlight[],
  details: Map<string, { payload: unknown | null; status: string; error: string | null }>,
): Promise<void> {
  for (const highlight of highlights) {
    const detail = details.get(`${highlight.type}:${highlight.id}`) || { payload: null, status: "not_requested", error: null };
    const summary = summarizeDetail(detail.payload);
    await db.query(
      `INSERT INTO mercadolibre_research_snapshots
         (run_id, category_id, rank_position, entity_type, entity_id, title, permalink, image_url,
          price, currency_id, brand, attributes, detail_status, detail_error, raw_highlight, raw_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (run_id, category_id, rank_position) DO NOTHING`,
      [runId, categoryId, highlight.position, highlight.type, highlight.id, summary.title, summary.permalink,
        summary.imageUrl, summary.price, summary.currencyId, summary.brand, JSON.stringify(summary.attributes),
        detail.status, detail.error, JSON.stringify(highlight.raw), detail.payload ? JSON.stringify(detail.payload) : null],
    );
  }
}

async function ensureRunCategories(
  pool: Pool,
  settings: ResearchSettings,
  run: { id: string; requestedCategoryIds: string[]; categoryLimit: number | null },
): Promise<void> {
  const existing = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::INTEGER AS count
       FROM mercadolibre_research_run_categories WHERE run_id = $1`,
    [run.id],
  );
  if (existing.rows[0].count > 0) return;

  const categories = await chooseCategories(pool, settings, run);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const categoryId of categories) {
      await db.query(
        `INSERT INTO mercadolibre_research_run_categories (run_id, category_id)
         VALUES ($1, $2) ON CONFLICT (run_id, category_id) DO NOTHING`,
        [run.id, categoryId],
      );
    }
    await db.query(
      `UPDATE mercadolibre_research_runs
          SET requested_category_ids = $2, categories_requested = $3
        WHERE id = $1`,
      [run.id, categories, categories.length],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function updateRunProgress(pool: Pool, runId: string): Promise<{
  processed: number;
  ranked: number;
  withoutRanking: number;
  failed: number;
  pending: number;
  snapshots: number;
}> {
  const result = await pool.query<{
    processed: number;
    ranked: number;
    withoutRanking: number;
    failed: number;
    pending: number;
    snapshots: number;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('ranked', 'no_ranking'))::INTEGER AS processed,
       COUNT(*) FILTER (WHERE status = 'ranked')::INTEGER AS ranked,
       COUNT(*) FILTER (WHERE status = 'no_ranking')::INTEGER AS "withoutRanking",
       COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed,
       COUNT(*) FILTER (WHERE status IN ('queued', 'running'))::INTEGER AS pending,
       COALESCE(SUM(snapshot_count), 0)::INTEGER AS snapshots
     FROM mercadolibre_research_run_categories WHERE run_id = $1`,
    [runId],
  );
  const progress = result.rows[0];
  await pool.query(
    `UPDATE mercadolibre_research_runs
        SET categories_processed = $2, categories_ranked = $3, categories_without_ranking = $4,
            categories_failed = $5, snapshots_created = $6, lease_until = NOW() + INTERVAL '10 minutes'
      WHERE id = $1`,
    [runId, progress.processed, progress.ranked, progress.withoutRanking, progress.failed, progress.snapshots],
  );
  return progress;
}

async function processRun(pool: Pool, client: MercadoLibreClient, settings: ResearchSettings, run: { id: string; requestedCategoryIds: string[]; categoryLimit: number | null }): Promise<void> {
  await synchronizeCategories(pool, client, settings.siteId);
  await ensureRunCategories(pool, settings, run);
  const categoryResult = await pool.query<{ categoryId: string }>(
    `SELECT category_id AS "categoryId"
       FROM mercadolibre_research_run_categories
      WHERE run_id = $1 AND status IN ('queued', 'running')
      ORDER BY category_id`,
    [run.id],
  );
  let fatalError: string | null = null;

  for (const { categoryId } of categoryResult.rows) {
    let highlights: Highlight[] = [];
    try {
      await pool.query(
        `UPDATE mercadolibre_research_run_categories
            SET status = 'running', attempts = attempts + 1, started_at = COALESCE(started_at, NOW()),
                finished_at = NULL, error_message = NULL
          WHERE run_id = $1 AND category_id = $2`,
        [run.id, categoryId],
      );
      const payload = await client.get(`/highlights/${settings.siteId}/category/${encodeURIComponent(categoryId)}`);
      highlights = parseHighlights(payload);
      const detailResults = new Map<string, { payload: unknown | null; status: string; error: string | null }>();
      if (settings.enrichDetails) {
        for (const highlight of highlights) {
          try {
            await pool.query(
              `UPDATE mercadolibre_research_runs
                  SET lease_until = NOW() + INTERVAL '10 minutes'
                WHERE id = $1 AND status = 'running'`,
              [run.id],
            );
            const detail = await client.get(detailPath(highlight.type, highlight.id));
            detailResults.set(`${highlight.type}:${highlight.id}`, { payload: detail, status: "loaded", error: null });
          } catch (error) {
            const status = error instanceof MercadoLibreHttpError && error.status === 404
              ? "not_found"
              : error instanceof MercadoLibreHttpError && error.status === 403
                ? "forbidden"
                : "failed";
            if (error instanceof MercadoLibreHttpError && error.status === 401) throw error;
            detailResults.set(`${highlight.type}:${highlight.id}`, { payload: null, status, error: error instanceof Error ? error.message : "Detail request failed." });
          }
        }
      }

      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await storeCategorySnapshots(db, run.id, categoryId, highlights, detailResults);
        await db.query(
          `UPDATE mercadolibre_research_categories
              SET last_checked_at = NOW(), last_ranked_at = CASE WHEN $2 > 0 THEN NOW() ELSE last_ranked_at END,
                  consecutive_no_ranking = CASE WHEN $2 > 0 THEN 0 ELSE consecutive_no_ranking + 1 END
            WHERE category_id = $1`,
          [categoryId, highlights.length],
        );
        await db.query(
          `UPDATE mercadolibre_research_run_categories
              SET status = $3, snapshot_count = $4, error_message = NULL, finished_at = NOW()
            WHERE run_id = $1 AND category_id = $2`,
          [run.id, categoryId, highlights.length ? "ranked" : "no_ranking", highlights.length],
        );
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
    } catch (error) {
      if (error instanceof MercadoLibreHttpError && error.status === 404) {
        const db = await pool.connect();
        try {
          await db.query("BEGIN");
          await db.query(
            `UPDATE mercadolibre_research_categories
                SET last_checked_at = NOW(), consecutive_no_ranking = consecutive_no_ranking + 1
              WHERE category_id = $1`,
            [categoryId],
          );
          await db.query(
            `UPDATE mercadolibre_research_run_categories
                SET status = 'no_ranking', snapshot_count = 0, error_message = NULL, finished_at = NOW()
              WHERE run_id = $1 AND category_id = $2`,
            [run.id, categoryId],
          );
          await db.query("COMMIT");
        } catch (dbError) {
          await db.query("ROLLBACK");
          throw dbError;
        } finally {
          db.release();
        }
      } else {
        const message = error instanceof Error ? error.message : "Unknown Mercado Libre error.";
        fatalError = message;
        await pool.query(
          `UPDATE mercadolibre_research_run_categories
              SET status = 'failed', snapshot_count = 0, error_message = $3, finished_at = NOW()
            WHERE run_id = $1 AND category_id = $2`,
          [run.id, categoryId, message.slice(0, 2000)],
        );
        if (error instanceof MercadoLibreHttpError && (error.status === 401 || error.status === 403)) break;
      }
    }
    await updateRunProgress(pool, run.id);
  }

  const progress = await updateRunProgress(pool, run.id);
  const status = fatalError && progress.processed === 0 ? "failed" : progress.failed > 0 || progress.pending > 0 ? "partial" : "completed";
  await pool.query(
    `UPDATE mercadolibre_research_runs
        SET status = $2, categories_processed = $3, categories_ranked = $4,
            categories_without_ranking = $5, categories_failed = $6, snapshots_created = $7,
            error_summary = $8, finished_at = NOW(), lease_until = NULL
      WHERE id = $1`,
    [run.id, status, progress.processed, progress.ranked, progress.withoutRanking, progress.failed, progress.snapshots, fatalError],
  );
  if (status !== "failed") {
    await pool.query("UPDATE mercadolibre_research_settings SET last_completed_at = NOW() WHERE id = 1");
    await pool.query(
      `DELETE FROM mercadolibre_research_snapshots
        WHERE captured_at < NOW() - make_interval(days => $1)`,
      [settings.retentionDays],
    );
  }
}

async function enqueueScheduledRun(pool: Pool, settings: ResearchSettings): Promise<void> {
  await pool.query(
    `INSERT INTO mercadolibre_research_runs (trigger_type)
     SELECT 'scheduled'
      WHERE NOT EXISTS (
        SELECT 1 FROM mercadolibre_research_runs WHERE status IN ('queued', 'running')
      )
     ON CONFLICT DO NOTHING`,
  );
  await pool.query(
    `UPDATE mercadolibre_research_settings
        SET next_run_at = CASE
          WHEN frequency_hours = 24 THEN
            CASE
              WHEN ((date_trunc('day', NOW() AT TIME ZONE timezone) + make_interval(hours => schedule_hour_local)) AT TIME ZONE timezone) > NOW()
                THEN ((date_trunc('day', NOW() AT TIME ZONE timezone) + make_interval(hours => schedule_hour_local)) AT TIME ZONE timezone)
              ELSE ((date_trunc('day', NOW() AT TIME ZONE timezone) + INTERVAL '1 day' + make_interval(hours => schedule_hour_local)) AT TIME ZONE timezone)
            END
          ELSE NOW() + make_interval(hours => frequency_hours)
        END
      WHERE id = 1`,
  );
}

export async function runResearchCycle(options: {
  pool: Pool;
  workerId: string;
  externalEnabled: boolean;
  accessToken: string;
  apiBaseUrl: string;
}): Promise<{ status: string; details: Record<string, unknown> }> {
  const settings = await loadSettings(options.pool);
  const ready = options.externalEnabled && Boolean(options.accessToken) && settings.isEnabled && Boolean(settings.termsAcknowledgedAt);
  if (!ready) {
    return {
      status: "disabled",
      details: {
        externalEnabled: options.externalEnabled,
        accessTokenConfigured: Boolean(options.accessToken),
        researchEnabled: settings.isEnabled,
        termsAcknowledged: Boolean(settings.termsAcknowledgedAt),
      },
    };
  }

  const dueResult = await options.pool.query<{ isDue: boolean }>(
    `SELECT next_run_at IS NULL OR next_run_at <= NOW() AS "isDue"
       FROM mercadolibre_research_settings WHERE id = 1`,
  );
  if (dueResult.rows[0]?.isDue) await enqueueScheduledRun(options.pool, settings);

  const run = await claimRun(options.pool, options.workerId);
  if (!run) return { status: "idle", details: { externalEnabled: true, accessTokenConfigured: true } };

  const client = new MercadoLibreClient({
    baseUrl: options.apiBaseUrl.replace(/\/$/, ""),
    accessToken: options.accessToken,
    requestDelayMs: settings.requestDelayMs,
    maxRetries: settings.maxRetries,
  });
  try {
    await processRun(options.pool, client, settings, run);
    return { status: "idle", details: { lastRunId: run.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mercado Libre research run failed.";
    await options.pool.query(
      `UPDATE mercadolibre_research_runs
          SET status = 'failed', error_summary = $2, finished_at = NOW(), lease_until = NULL
        WHERE id = $1`,
      [run.id, message],
    );
    return { status: "error", details: { lastRunId: run.id, error: message } };
  }
}
