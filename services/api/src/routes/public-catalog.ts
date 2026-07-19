import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";

const router = Router();

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(100).optional(),
});

router.get("/products", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid catalog filters." });
    return;
  }
  const search = parsed.data.q ? `%${parsed.data.q}%` : null;
  const category = parsed.data.category || null;

  try {
    const result = await pool.query(
      `SELECT
         products.id,
         products.slug,
         products.name,
         products.brand,
         products.short_description AS "shortDescription",
         categories.name AS category,
         products.sale_unit AS "saleUnit",
         products.unit_type AS "unitType",
         products.minimum_quantity AS "minimumQuantity",
         products.quantity_increment AS "quantityIncrement",
         products.base_price AS "basePrice",
         products.compare_at_price AS "compareAtPrice",
         COALESCE(primary_image.image_url, products.image_url) AS "imageUrl",
         COALESCE(stock.available_quantity, 0) AS "availableQuantity",
         COALESCE(prices.tiers, '[]'::jsonb) AS "wholesaleTiers",
         COALESCE(variants.items, '[]'::jsonb) AS variants
       FROM catalog_products products
       LEFT JOIN catalog_categories categories ON categories.id = products.category_id
       LEFT JOIN LATERAL (
         SELECT image_url
         FROM catalog_product_images images
         WHERE images.product_id = products.id
         ORDER BY images.is_primary DESC, images.display_order, images.created_at
         LIMIT 1
       ) primary_image ON TRUE
       LEFT JOIN LATERAL (
         SELECT SUM(levels.on_hand - levels.reserved) AS available_quantity
         FROM inventory_levels levels
         WHERE levels.product_id = products.id
       ) stock ON TRUE
       LEFT JOIN LATERAL (
         SELECT JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'minimumQuantity', tiers.minimum_quantity,
             'unitPrice', tiers.unit_price
           ) ORDER BY tiers.minimum_quantity
         ) AS tiers
         FROM catalog_price_tiers tiers
         WHERE tiers.product_id = products.id AND tiers.variant_id IS NULL
       ) prices ON TRUE
       LEFT JOIN LATERAL (
         SELECT JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', product_variants.id,
             'sku', product_variants.sku,
             'name', product_variants.name,
             'attributes', product_variants.attributes,
             'price', COALESCE(product_variants.price_override, products.base_price),
             'availableQuantity', COALESCE((
               SELECT SUM(levels.on_hand - levels.reserved)
               FROM inventory_levels levels
               WHERE levels.product_id = products.id AND levels.variant_id = product_variants.id
             ), 0),
             'wholesaleTiers', COALESCE((
               SELECT JSONB_AGG(
                 JSONB_BUILD_OBJECT(
                   'minimumQuantity', variant_tiers.minimum_quantity,
                   'unitPrice', variant_tiers.unit_price
                 ) ORDER BY variant_tiers.minimum_quantity
               )
               FROM catalog_price_tiers variant_tiers
               WHERE variant_tiers.product_id = products.id
                 AND variant_tiers.variant_id = product_variants.id
             ), '[]'::jsonb)
           ) ORDER BY product_variants.created_at, product_variants.name
         ) AS items
         FROM catalog_product_variants product_variants
         WHERE product_variants.product_id = products.id AND product_variants.is_active = TRUE
       ) variants ON TRUE
       WHERE products.is_published = TRUE
         AND products.archived_at IS NULL
         AND ($1::text IS NULL OR products.name ILIKE $1 OR products.brand ILIKE $1)
         AND ($2::text IS NULL OR categories.slug = $2)
       ORDER BY products.is_featured DESC, products.name ASC
       LIMIT 120`,
      [search, category],
    );

    const products = result.rows.map((row) => ({
      ...row,
      basePrice: Number(row.basePrice),
      compareAtPrice: row.compareAtPrice == null ? null : Number(row.compareAtPrice),
      availableQuantity: Number(row.availableQuantity),
      minimumQuantity: Number(row.minimumQuantity),
      quantityIncrement: Number(row.quantityIncrement),
      wholesaleTiers: (row.wholesaleTiers || []).map((tier: Record<string, unknown>) => ({
        minimumQuantity: Number(tier.minimumQuantity),
        unitPrice: Number(tier.unitPrice),
      })),
      variants: (row.variants || []).map((variant: Record<string, unknown>) => ({
        ...variant,
        price: Number(variant.price),
        availableQuantity: Number(variant.availableQuantity),
        wholesaleTiers: ((variant.wholesaleTiers as Record<string, unknown>[]) || []).map((tier) => ({
          minimumQuantity: Number(tier.minimumQuantity),
          unitPrice: Number(tier.unitPrice),
        })),
      })),
    }));
    res.json({ success: true, products });
  } catch (error) {
    console.error("Public catalog read failed:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Could not load the catalog." });
  }
});

export default router;
