import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import type { AdminRole } from "@siemprebarato/shared";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { recordAuditEvent } from "../audit.js";
import { requireAdminSession } from "../middleware/admin-session.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireRole } from "../middleware/require-role.js";
import {
  catalogBulkStatusSchema,
  catalogCategoryInputSchema,
  catalogListQuerySchema,
  catalogProductInputSchema,
  type CatalogProductInput,
} from "../catalog-rules.js";

const router = Router();
const readRoles: AdminRole[] = ["super_admin", "admin", "catalog_manager", "order_manager", "support", "viewer"];
const writeRoles: AdminRole[] = ["super_admin", "admin", "catalog_manager"];
const idSchema = z.string().uuid();

class CatalogConflictError extends Error {}

function numberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function productStatus(row: Record<string, unknown>): "draft" | "published" | "archived" {
  if (row.archived_at) return "archived";
  return row.is_published ? "published" : "draft";
}

function databaseMessage(error: unknown): { status: number; message: string } {
  if (error instanceof CatalogConflictError) return { status: 409, message: error.message };
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code === "23505") {
    if (databaseError.constraint?.includes("slug")) return { status: 409, message: "Ya existe un producto o categoría con ese slug." };
    if (databaseError.constraint?.includes("barcode")) return { status: 409, message: "Ese código de barras ya está en uso." };
    return { status: 409, message: "El SKU o identificador ya está en uso." };
  }
  if (databaseError.code === "23503") return { status: 400, message: "La categoría, bodega o variante seleccionada no existe." };
  if (databaseError.code === "23514") return { status: 400, message: "Los valores no cumplen las reglas del catálogo." };
  return { status: 500, message: "No se pudo guardar el producto." };
}

async function readProduct(client: Pick<PoolClient, "query">, productId: string) {
  const productResult = await client.query(
    `SELECT
       products.*,
       categories.name AS category_name,
       categories.slug AS category_slug
     FROM catalog_products products
     LEFT JOIN catalog_categories categories ON categories.id = products.category_id
     WHERE products.id = $1`,
    [productId],
  );
  if (!productResult.rowCount) return null;
  const row = productResult.rows[0];

  const variantsResult = await client.query(
      `SELECT id, sku, barcode, name, attributes, price_override, weight_grams, is_active, created_at, updated_at
       FROM catalog_product_variants WHERE product_id = $1 ORDER BY created_at, name`,
      [productId],
    );
  const tiersResult = await client.query(
      `SELECT id, variant_id, minimum_quantity, unit_price
       FROM catalog_price_tiers WHERE product_id = $1 ORDER BY variant_id NULLS FIRST, minimum_quantity`,
      [productId],
    );
  const imagesResult = await client.query(
      `SELECT id, variant_id, image_url, alt_text, display_order, is_primary
       FROM catalog_product_images WHERE product_id = $1 ORDER BY display_order, created_at`,
      [productId],
    );
  const inventoryResult = await client.query(
      `SELECT
         levels.id, levels.warehouse_id, warehouses.code AS warehouse_code, warehouses.name AS warehouse_name,
         levels.variant_id, levels.on_hand, levels.reserved, levels.reorder_point,
         levels.on_hand - levels.reserved AS available
       FROM inventory_levels levels
       JOIN warehouses ON warehouses.id = levels.warehouse_id
       WHERE levels.product_id = $1
       ORDER BY warehouses.name, levels.variant_id NULLS FIRST`,
      [productId],
    );
  const eventsResult = await client.query(
      `SELECT events.id, events.action, events.details, events.created_at,
              users.display_name AS actor_name, users.email AS actor_email
       FROM catalog_product_events events
       LEFT JOIN admin_users users ON users.id = events.actor_admin_user_id
       WHERE events.product_id = $1
       ORDER BY events.created_at DESC LIMIT 50`,
      [productId],
    );
  const movementsResult = await client.query(
      `SELECT movements.id, movements.variant_id, movements.movement_type,
              movements.quantity_delta, movements.on_hand_after, movements.reason,
              movements.created_at, warehouses.code AS warehouse_code,
              users.display_name AS actor_name
       FROM inventory_movements movements
       JOIN warehouses ON warehouses.id = movements.warehouse_id
       LEFT JOIN admin_users users ON users.id = movements.actor_admin_user_id
       WHERE movements.product_id = $1
       ORDER BY movements.created_at DESC LIMIT 100`,
      [productId],
    );

  return {
    id: row.id,
    version: row.version,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    shortDescription: row.short_description,
    description: row.description,
    unitType: row.unit_type,
    saleUnit: row.sale_unit,
    minimumQuantity: Number(row.minimum_quantity),
    quantityIncrement: Number(row.quantity_increment),
    basePrice: Number(row.base_price),
    compareAtPrice: numberOrNull(row.compare_at_price),
    currencyCode: row.currency_code,
    taxIncluded: row.tax_included,
    isFeatured: row.is_featured,
    status: productStatus(row),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    variants: variantsResult.rows.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      name: variant.name,
      attributes: variant.attributes || {},
      priceOverride: numberOrNull(variant.price_override),
      weightGrams: numberOrNull(variant.weight_grams),
      isActive: variant.is_active,
    })),
    priceTiers: tiersResult.rows.map((tier) => ({
      id: tier.id,
      variantId: tier.variant_id,
      minimumQuantity: Number(tier.minimum_quantity),
      unitPrice: Number(tier.unit_price),
    })),
    images: imagesResult.rows.map((image) => ({
      id: image.id,
      variantId: image.variant_id,
      imageUrl: image.image_url,
      altText: image.alt_text,
      isPrimary: image.is_primary,
    })),
    inventory: inventoryResult.rows.map((inventory) => ({
      id: inventory.id,
      warehouseId: inventory.warehouse_id,
      warehouseCode: inventory.warehouse_code,
      warehouseName: inventory.warehouse_name,
      variantId: inventory.variant_id,
      onHand: Number(inventory.on_hand),
      reserved: Number(inventory.reserved),
      available: Number(inventory.available),
      reorderPoint: Number(inventory.reorder_point),
    })),
    events: eventsResult.rows.map((event) => ({
      id: Number(event.id),
      action: event.action,
      details: event.details,
      actorName: event.actor_name || event.actor_email || "Sistema",
      createdAt: event.created_at,
    })),
    inventoryMovements: movementsResult.rows.map((movement) => ({
      id: Number(movement.id),
      variantId: movement.variant_id,
      warehouseCode: movement.warehouse_code,
      movementType: movement.movement_type,
      quantityDelta: Number(movement.quantity_delta),
      onHandAfter: Number(movement.on_hand_after),
      reason: movement.reason,
      actorName: movement.actor_name || "Sistema",
      createdAt: movement.created_at,
    })),
  };
}

async function synchronizeVariants(client: PoolClient, productId: string, data: CatalogProductInput): Promise<void> {
  const requestedIds = data.variants.map((variant) => variant.id);
  if (requestedIds.length) {
    const ownership = await client.query<{ id: string; product_id: string }>(
      "SELECT id, product_id FROM catalog_product_variants WHERE id = ANY($1::uuid[])",
      [requestedIds],
    );
    if (ownership.rows.some((variant) => variant.product_id !== productId)) {
      throw new CatalogConflictError("Una variante pertenece a otro producto.");
    }
  }

  const blockedRemoval = await client.query<{ id: string }>(
    `SELECT variants.id
     FROM catalog_product_variants variants
     LEFT JOIN inventory_levels levels ON levels.variant_id = variants.id
     LEFT JOIN inventory_reservations reservations
       ON reservations.inventory_level_id = levels.id AND reservations.status = 'active'
     WHERE variants.product_id = $1
       AND NOT (variants.id = ANY($2::uuid[]))
     GROUP BY variants.id
     HAVING COALESCE(SUM(levels.reserved), 0) > 0 OR COUNT(reservations.id) > 0`,
    [productId, requestedIds],
  );
  if (blockedRemoval.rowCount) throw new CatalogConflictError("No se puede eliminar una variante con reservas activas.");

  await client.query(
    `DELETE FROM catalog_product_variants
     WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))`,
    [productId, requestedIds],
  );

  for (const variant of data.variants) {
    await client.query(
      `INSERT INTO catalog_product_variants (
         id, product_id, sku, barcode, name, attributes, price_override, weight_grams, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku,
         barcode = EXCLUDED.barcode,
         name = EXCLUDED.name,
         attributes = EXCLUDED.attributes,
         price_override = EXCLUDED.price_override,
         weight_grams = EXCLUDED.weight_grams,
         is_active = EXCLUDED.is_active`,
      [variant.id, productId, variant.sku, variant.barcode || null, variant.name, variant.attributes,
        variant.priceOverride, variant.weightGrams, variant.isActive],
    );
  }
}

async function synchronizePricesAndImages(client: PoolClient, productId: string, data: CatalogProductInput): Promise<void> {
  await client.query("DELETE FROM catalog_price_tiers WHERE product_id = $1", [productId]);
  for (const tier of data.priceTiers) {
    await client.query(
      `INSERT INTO catalog_price_tiers (product_id, variant_id, minimum_quantity, unit_price)
       VALUES ($1,$2,$3,$4)`,
      [productId, tier.variantId, tier.minimumQuantity, tier.unitPrice],
    );
  }

  await client.query("DELETE FROM catalog_product_images WHERE product_id = $1", [productId]);
  const hasPrimary = data.images.some((image) => image.isPrimary);
  for (const [index, image] of data.images.entries()) {
    await client.query(
      `INSERT INTO catalog_product_images (
         product_id, variant_id, image_url, alt_text, display_order, is_primary
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [productId, image.variantId, image.imageUrl, image.altText, index, image.isPrimary || !hasPrimary && index === 0],
    );
  }
  await client.query(
    `UPDATE catalog_products
     SET image_url = (
       SELECT image_url FROM catalog_product_images
       WHERE product_id = $1
       ORDER BY is_primary DESC, display_order, created_at LIMIT 1
     )
     WHERE id = $1`,
    [productId],
  );
}

async function synchronizeInventory(
  client: PoolClient,
  productId: string,
  data: CatalogProductInput,
  actorAdminUserId: string,
): Promise<void> {
  const existingResult = await client.query<{
    id: string; warehouse_id: string; variant_id: string | null; on_hand: string; reserved: string;
  }>(
    `SELECT id, warehouse_id, variant_id, on_hand, reserved
     FROM inventory_levels WHERE product_id = $1 FOR UPDATE`,
    [productId],
  );
  const existingByKey = new Map(existingResult.rows.map((row) => [`${row.warehouse_id}:${row.variant_id || "product"}`, row]));
  const requestedKeys = new Set<string>();

  for (const inventory of data.inventory) {
    const key = `${inventory.warehouseId}:${inventory.variantId || "product"}`;
    requestedKeys.add(key);
    const existing = existingByKey.get(key);
    if (existing && inventory.onHand < Number(existing.reserved)) {
      throw new CatalogConflictError("El stock físico no puede ser menor que el stock reservado.");
    }
    let levelId: string;
    let delta: number;
    if (existing) {
      delta = inventory.onHand - Number(existing.on_hand);
      levelId = existing.id;
      await client.query(
        `UPDATE inventory_levels SET on_hand = $1, reorder_point = $2 WHERE id = $3`,
        [inventory.onHand, inventory.reorderPoint, existing.id],
      );
    } else {
      delta = inventory.onHand;
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO inventory_levels (
           warehouse_id, product_id, variant_id, on_hand, reserved, reorder_point
         ) VALUES ($1,$2,$3,$4,0,$5) RETURNING id`,
        [inventory.warehouseId, productId, inventory.variantId, inventory.onHand, inventory.reorderPoint],
      );
      levelId = inserted.rows[0].id;
    }
    if (delta !== 0) {
      await client.query(
        `INSERT INTO inventory_movements (
           inventory_level_id, warehouse_id, product_id, variant_id, movement_type,
           quantity_delta, on_hand_after, reason, actor_admin_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [levelId, inventory.warehouseId, productId, inventory.variantId, existing ? "adjustment" : "initial",
          delta, inventory.onHand, inventory.reason || (existing ? "Ajuste desde administración" : "Stock inicial"), actorAdminUserId],
      );
    }
  }

  for (const existing of existingResult.rows) {
    const key = `${existing.warehouse_id}:${existing.variant_id || "product"}`;
    if (requestedKeys.has(key)) continue;
    const reservations = await client.query(
      `SELECT 1 FROM inventory_reservations
       WHERE inventory_level_id = $1 AND status = 'active' LIMIT 1`,
      [existing.id],
    );
    if (Number(existing.reserved) > 0 || reservations.rowCount) {
      throw new CatalogConflictError("No se puede eliminar una fila de inventario con reservas activas.");
    }
    await client.query("DELETE FROM inventory_levels WHERE id = $1", [existing.id]);
  }
}

async function saveProduct(
  client: PoolClient,
  data: CatalogProductInput,
  actorAdminUserId: string,
  productId?: string,
): Promise<{ productId: string; action: string }> {
  let previousStatus: "draft" | "published" | "archived" | null = null;
  let savedProductId = productId;
  if (productId) {
    const current = await client.query<Record<string, unknown>>(
      "SELECT id, version, is_published, archived_at FROM catalog_products WHERE id = $1 FOR UPDATE",
      [productId],
    );
    if (!current.rowCount) throw new CatalogConflictError("Producto no encontrado.");
    if (!data.version || data.version !== Number(current.rows[0].version)) {
      throw new CatalogConflictError("El producto cambió en otra sesión. Recarga antes de volver a guardar.");
    }
    previousStatus = productStatus(current.rows[0]);
    await client.query(
      `UPDATE catalog_products SET
         category_id=$1, sku=$2, slug=$3, name=$4, brand=$5,
         short_description=$6, description=$7, unit_type=$8, sale_unit=$9,
         minimum_quantity=$10, quantity_increment=$11, base_price=$12,
         compare_at_price=$13, tax_included=$14, is_featured=$15,
         is_published=$16,
         published_at=CASE WHEN $16 THEN COALESCE(published_at, NOW()) ELSE published_at END,
         archived_at=CASE WHEN $17 THEN COALESCE(archived_at, NOW()) ELSE NULL END,
         seo_title=$18, seo_description=$19, updated_by=$20, version=version+1
       WHERE id=$21`,
      [data.categoryId, data.sku, data.slug, data.name, data.brand || null, data.shortDescription,
        data.description, data.unitType, data.saleUnit, data.minimumQuantity, data.quantityIncrement,
        data.basePrice, data.compareAtPrice, data.taxIncluded, data.isFeatured, data.status === "published",
        data.status === "archived", data.seoTitle, data.seoDescription, actorAdminUserId, productId],
    );
  } else {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO catalog_products (
         category_id, sku, slug, name, brand, short_description, description,
         unit_type, sale_unit, minimum_quantity, quantity_increment, base_price,
         compare_at_price, currency_code, tax_included, is_featured, is_published,
         published_at, archived_at, seo_title, seo_description, created_by, updated_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'CLP',$14,$15,$16,
         CASE WHEN $16 THEN NOW() ELSE NULL END,
         CASE WHEN $17 THEN NOW() ELSE NULL END,
         $18,$19,$20,$20
       ) RETURNING id`,
      [data.categoryId, data.sku, data.slug, data.name, data.brand || null, data.shortDescription,
        data.description, data.unitType, data.saleUnit, data.minimumQuantity, data.quantityIncrement,
        data.basePrice, data.compareAtPrice, data.taxIncluded, data.isFeatured, data.status === "published",
        data.status === "archived", data.seoTitle, data.seoDescription, actorAdminUserId],
    );
    savedProductId = inserted.rows[0].id;
  }

  await synchronizeVariants(client, savedProductId!, data);
  await synchronizePricesAndImages(client, savedProductId!, data);
  await synchronizeInventory(client, savedProductId!, data, actorAdminUserId);

  let action = productId ? "catalog_product.updated" : "catalog_product.created";
  if (productId && data.status !== previousStatus) action = `catalog_product.${data.status}`;
  await client.query(
    `INSERT INTO catalog_product_events (product_id, actor_admin_user_id, action, details)
     VALUES ($1,$2,$3,$4)`,
    [savedProductId, actorAdminUserId, action, {
      status: data.status,
      variantCount: data.variants.length,
      imageCount: data.images.length,
      priceTierCount: data.priceTiers.length,
      inventoryRowCount: data.inventory.length,
    }],
  );
  return { productId: savedProductId!, action };
}

router.use(requireAdminSession);

router.get("/metadata", requireRole(readRoles), async (_req, res) => {
  try {
    const [categories, warehouses] = await Promise.all([
      pool.query(
        `SELECT id, parent_id AS "parentId", name, slug, description, is_active AS "isActive"
         FROM catalog_categories ORDER BY display_order, name`,
      ),
      pool.query(
        `SELECT id, code, name, address, is_active AS "isActive"
         FROM warehouses ORDER BY is_active DESC, name`,
      ),
    ]);
    res.json({ success: true, categories: categories.rows, warehouses: warehouses.rows });
  } catch (error) {
    console.error("Catalog metadata failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo cargar la configuración del catálogo." });
  }
});

router.post("/categories", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsed = catalogCategoryInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Revisa los datos de la categoría.", issues: parsed.error.issues });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO catalog_categories (parent_id, name, slug, description, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, parent_id AS "parentId", name, slug, description, is_active AS "isActive"`,
      [parsed.data.parentId, parsed.data.name, parsed.data.slug, parsed.data.description, parsed.data.isActive],
    );
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "catalog_category.created",
      entityType: "catalog_category",
      entityId: inserted.rows[0].id,
      details: { name: parsed.data.name, slug: parsed.data.slug },
    });
    await client.query("COMMIT");
    res.status(201).json({ success: true, category: inserted.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    const response = databaseMessage(error);
    console.error("Catalog category create failed:", error instanceof Error ? error.message : error);
    res.status(response.status).json({ success: false, message: response.message });
  } finally {
    client.release();
  }
});

router.get("/products", requireRole(readRoles), async (req, res) => {
  const parsed = catalogListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Filtros de catálogo inválidos." });
    return;
  }
  const { q, status, categoryId, page, pageSize } = parsed.data;
  const search = q ? `%${q}%` : null;
  const offset = (page - 1) * pageSize;
  try {
    const [productsResult, statsResult] = await Promise.all([
      pool.query(
        `SELECT
           products.id, products.version, products.sku, products.slug, products.name, products.brand,
           products.base_price AS "basePrice", products.is_published, products.archived_at,
           products.is_featured AS "isFeatured", products.updated_at AS "updatedAt",
           categories.id AS "categoryId", categories.name AS category,
           COALESCE(images.image_url, products.image_url) AS "imageUrl",
           COALESCE(stock.available, 0) AS "availableQuantity",
           COALESCE(variants.count, 0) AS "variantCount",
           COUNT(*) OVER()::int AS "totalCount"
         FROM catalog_products products
         LEFT JOIN catalog_categories categories ON categories.id = products.category_id
         LEFT JOIN LATERAL (
           SELECT image_url FROM catalog_product_images
           WHERE product_id = products.id ORDER BY is_primary DESC, display_order LIMIT 1
         ) images ON TRUE
         LEFT JOIN LATERAL (
           SELECT SUM(on_hand - reserved) AS available FROM inventory_levels WHERE product_id = products.id
         ) stock ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS count FROM catalog_product_variants WHERE product_id = products.id
         ) variants ON TRUE
         WHERE ($1::text IS NULL OR products.name ILIKE $1 OR products.sku ILIKE $1 OR products.brand ILIKE $1)
           AND ($2::uuid IS NULL OR products.category_id = $2)
           AND (
             $3 = 'all'
             OR ($3 = 'published' AND products.is_published = TRUE AND products.archived_at IS NULL)
             OR ($3 = 'draft' AND products.is_published = FALSE AND products.archived_at IS NULL)
             OR ($3 = 'archived' AND products.archived_at IS NOT NULL)
           )
         ORDER BY products.updated_at DESC, products.name
         LIMIT $4 OFFSET $5`,
        [search, categoryId || null, status, pageSize, offset],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE archived_at IS NULL)::int AS total,
           COUNT(*) FILTER (WHERE is_published = TRUE AND archived_at IS NULL)::int AS published,
           COUNT(*) FILTER (WHERE is_published = FALSE AND archived_at IS NULL)::int AS draft,
           COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived
         FROM catalog_products`,
      ),
    ]);
    const total = productsResult.rows[0]?.totalCount || 0;
    res.json({
      success: true,
      products: productsResult.rows.map((row) => ({
        ...row,
        basePrice: Number(row.basePrice),
        availableQuantity: Number(row.availableQuantity),
        status: productStatus(row),
        is_published: undefined,
        archived_at: undefined,
        totalCount: undefined,
      })),
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      stats: statsResult.rows[0],
    });
  } catch (error) {
    console.error("Admin catalog list failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo cargar el catálogo." });
  }
});

router.post("/products/bulk-status", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsed = catalogBulkStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Selección o estado inválido." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `UPDATE catalog_products SET
         is_published = $1,
         published_at = CASE WHEN $1 THEN COALESCE(published_at, NOW()) ELSE published_at END,
         archived_at = CASE WHEN $2 THEN COALESCE(archived_at, NOW()) ELSE NULL END,
         updated_by = $3,
         version = version + 1
       WHERE id = ANY($4::uuid[])
       RETURNING id`,
      [parsed.data.status === "published", parsed.data.status === "archived", req.adminSession!.user.id, parsed.data.productIds],
    );
    for (const product of result.rows) {
      await client.query(
        `INSERT INTO catalog_product_events (product_id, actor_admin_user_id, action, details)
         VALUES ($1,$2,$3,$4)`,
        [product.id, req.adminSession!.user.id, `catalog_product.${parsed.data.status}`, { source: "bulk" }],
      );
    }
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "catalog_product.bulk_status",
      entityType: "catalog_product",
      details: { status: parsed.data.status, productIds: result.rows.map((product) => product.id) },
    });
    await client.query("COMMIT");
    res.json({ success: true, updated: result.rowCount });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Catalog bulk status failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo actualizar la selección." });
  } finally {
    client.release();
  }
});

router.post("/products/:id/duplicate", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Producto inválido." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const source = await readProduct(client, parsedId.data);
    if (!source) {
      await client.query("ROLLBACK");
      res.status(404).json({ success: false, message: "Producto no encontrado." });
      return;
    }

    async function uniqueValue(column: "sku" | "slug", base: string): Promise<string> {
      for (let suffix = 1; suffix <= 999; suffix += 1) {
        const value = column === "sku" ? `${base}-COPY${suffix}`.slice(0, 100) : `${base}-copia-${suffix}`.slice(0, 160);
        const existing = await client.query(`SELECT 1 FROM catalog_products WHERE LOWER(${column}) = LOWER($1)`, [value]);
        if (!existing.rowCount) return value;
      }
      throw new CatalogConflictError("No se pudo generar un SKU único para la copia.");
    }

    const copiedSku = await uniqueValue("sku", source.sku);
    const copiedSlug = await uniqueValue("slug", source.slug);
    const variantIds = new Map(source.variants.map((variant) => [variant.id, crypto.randomUUID()]));
    const variantSkus = new Map<string, string>();
    for (const variant of source.variants) {
      let copiedVariantSku = "";
      for (let suffix = 1; suffix <= 999; suffix += 1) {
        const candidate = `${variant.sku}-COPY${suffix}`.slice(0, 100);
        const existing = await client.query(
          "SELECT 1 FROM catalog_product_variants WHERE LOWER(sku) = LOWER($1)",
          [candidate],
        );
        if (!existing.rowCount) { copiedVariantSku = candidate; break; }
      }
      if (!copiedVariantSku) throw new CatalogConflictError("No se pudo generar un SKU único para una variante.");
      variantSkus.set(variant.id, copiedVariantSku);
    }
    const clone = catalogProductInputSchema.parse({
      categoryId: source.categoryId,
      sku: copiedSku,
      slug: copiedSlug,
      name: `${source.name} · copia`,
      brand: source.brand,
      shortDescription: source.shortDescription,
      description: source.description,
      unitType: source.unitType,
      saleUnit: source.saleUnit,
      minimumQuantity: source.minimumQuantity,
      quantityIncrement: source.quantityIncrement,
      basePrice: source.basePrice,
      compareAtPrice: source.compareAtPrice,
      taxIncluded: source.taxIncluded,
      isFeatured: false,
      status: "draft",
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      variants: source.variants.map((variant) => ({ ...variant, id: variantIds.get(variant.id), sku: variantSkus.get(variant.id), barcode: null })),
      images: source.images.map((image) => ({ imageUrl: image.imageUrl, altText: image.altText, isPrimary: image.isPrimary, variantId: image.variantId ? variantIds.get(image.variantId) : null })),
      priceTiers: source.priceTiers.map((tier) => ({ minimumQuantity: tier.minimumQuantity, unitPrice: tier.unitPrice, variantId: tier.variantId ? variantIds.get(tier.variantId) : null })),
      inventory: source.inventory.map((inventory) => ({ warehouseId: inventory.warehouseId, variantId: inventory.variantId ? variantIds.get(inventory.variantId) : null, onHand: 0, reorderPoint: inventory.reorderPoint, reason: "Producto duplicado sin stock" })),
    });
    const saved = await saveProduct(client, clone, req.adminSession!.user.id);
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: "catalog_product.duplicated",
      entityType: "catalog_product",
      entityId: saved.productId,
      details: { sourceProductId: source.id, sku: copiedSku },
    });
    await client.query("COMMIT");
    const product = await readProduct(client, saved.productId);
    res.status(201).json({ success: true, product });
  } catch (error) {
    await client.query("ROLLBACK");
    const response = databaseMessage(error);
    console.error("Catalog product duplicate failed:", error instanceof Error ? error.message : error);
    res.status(response.status).json({ success: false, message: response.message });
  } finally {
    client.release();
  }
});

router.get("/products/:id", requireRole(readRoles), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ success: false, message: "Producto inválido." });
    return;
  }
  try {
    const product = await readProduct(pool as unknown as Pick<PoolClient, "query">, parsedId.data);
    if (!product) {
      res.status(404).json({ success: false, message: "Producto no encontrado." });
      return;
    }
    res.json({ success: true, product });
  } catch (error) {
    console.error("Admin product read failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "No se pudo cargar el producto." });
  }
});

router.post("/products", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsed = catalogProductInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Revisa los datos del producto.", issues: parsed.error.issues });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await saveProduct(client, parsed.data, req.adminSession!.user.id);
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: saved.action,
      entityType: "catalog_product",
      entityId: saved.productId,
      details: { sku: parsed.data.sku, status: parsed.data.status },
    });
    await client.query("COMMIT");
    const product = await readProduct(client, saved.productId);
    res.status(201).json({ success: true, product });
  } catch (error) {
    await client.query("ROLLBACK");
    const response = databaseMessage(error);
    console.error("Catalog product create failed:", error instanceof Error ? error.message : error);
    res.status(response.status).json({ success: false, message: response.message });
  } finally {
    client.release();
  }
});

router.put("/products/:id", requireCsrf, requireRole(writeRoles), async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);
  const parsed = catalogProductInputSchema.safeParse(req.body);
  if (!parsedId.success || !parsed.success) {
    res.status(400).json({ success: false, message: "Revisa los datos del producto.", issues: parsed.success ? [] : parsed.error.issues });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await saveProduct(client, parsed.data, req.adminSession!.user.id, parsedId.data);
    await recordAuditEvent(client, req, {
      actorAdminUserId: req.adminSession?.user.id,
      action: saved.action,
      entityType: "catalog_product",
      entityId: saved.productId,
      details: { sku: parsed.data.sku, status: parsed.data.status, version: parsed.data.version },
    });
    await client.query("COMMIT");
    const product = await readProduct(client, saved.productId);
    res.json({ success: true, product });
  } catch (error) {
    await client.query("ROLLBACK");
    const response = databaseMessage(error);
    console.error("Catalog product update failed:", error instanceof Error ? error.message : error);
    res.status(response.status).json({ success: false, message: response.message });
  } finally {
    client.release();
  }
});

export default router;
