import { z } from "zod";

const requiredText = (label: string, maximum: number) =>
  z.string().trim().min(1, `${label} is required.`).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum);
const money = z.number().finite().min(0).max(999_999_999_999.99);
const quantity = z.number().finite().positive().max(999_999_999.999);

const variantSchema = z.object({
  id: z.string().uuid(),
  sku: requiredText("Variant SKU", 100).regex(/^[A-Za-z0-9._-]+$/, "Variant SKU contains invalid characters."),
  barcode: z.string().trim().max(100).nullable(),
  name: requiredText("Variant name", 160),
  attributes: z.record(z.string().trim().min(1).max(80), z.string().trim().max(160)),
  priceOverride: money.nullable(),
  weightGrams: z.number().int().positive().max(10_000_000).nullable(),
  isActive: z.boolean(),
});

const priceTierSchema = z.object({
  variantId: z.string().uuid().nullable(),
  minimumQuantity: quantity.refine((value) => value > 1, "Wholesale tiers must start above one."),
  unitPrice: money,
});

const inventorySchema = z.object({
  warehouseId: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  onHand: z.number().finite().min(0).max(999_999_999.999),
  reorderPoint: z.number().finite().min(0).max(999_999_999.999),
  reason: optionalText(500),
});

const imageSchema = z.object({
  imageUrl: z.string().trim().url().max(2048).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Images must use HTTP or HTTPS."),
  altText: optionalText(300),
  variantId: z.string().uuid().nullable(),
  isPrimary: z.boolean(),
});

export const catalogProductInputSchema = z.object({
  version: z.number().int().positive().optional(),
  categoryId: z.string().uuid().nullable(),
  sku: requiredText("SKU", 100).regex(/^[A-Za-z0-9._-]+$/, "SKU contains invalid characters."),
  slug: requiredText("Slug", 160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug."),
  name: requiredText("Product name", 200),
  brand: optionalText(160).nullable(),
  shortDescription: optionalText(500),
  description: optionalText(20_000),
  unitType: z.enum(["unit", "weight"]),
  saleUnit: requiredText("Sale unit", 40),
  minimumQuantity: quantity,
  quantityIncrement: quantity,
  basePrice: money,
  compareAtPrice: money.nullable(),
  taxIncluded: z.boolean(),
  isFeatured: z.boolean(),
  status: z.enum(["draft", "published", "archived"]),
  seoTitle: optionalText(180),
  seoDescription: optionalText(320),
  images: z.array(imageSchema).max(12),
  variants: z.array(variantSchema).max(100),
  priceTiers: z.array(priceTierSchema).max(100),
  inventory: z.array(inventorySchema).max(500),
}).superRefine((data, ctx) => {
  if (data.compareAtPrice !== null && data.compareAtPrice < data.basePrice) {
    ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "Comparison price cannot be lower than the base price." });
  }

  if (data.unitType === "unit" && (!Number.isInteger(data.minimumQuantity) || !Number.isInteger(data.quantityIncrement))) {
    ctx.addIssue({ code: "custom", path: ["minimumQuantity"], message: "Unit products require whole-number quantities." });
  }

  const variantIds = new Set<string>();
  const variantSkus = new Set<string>();
  const barcodes = new Set<string>();
  const variantPrices = new Map<string, number>();
  data.variants.forEach((variant, index) => {
    const skuKey = variant.sku.toLowerCase();
    if (variantIds.has(variant.id)) ctx.addIssue({ code: "custom", path: ["variants", index, "id"], message: "Duplicate variant identifier." });
    if (variantSkus.has(skuKey)) ctx.addIssue({ code: "custom", path: ["variants", index, "sku"], message: "Variant SKUs must be unique." });
    if (skuKey === data.sku.toLowerCase()) ctx.addIssue({ code: "custom", path: ["variants", index, "sku"], message: "Variant SKU must differ from the product SKU." });
    variantIds.add(variant.id);
    variantSkus.add(skuKey);
    variantPrices.set(variant.id, variant.priceOverride ?? data.basePrice);
    if (variant.barcode) {
      const barcodeKey = variant.barcode.toLowerCase();
      if (barcodes.has(barcodeKey)) ctx.addIssue({ code: "custom", path: ["variants", index, "barcode"], message: "Variant barcodes must be unique." });
      barcodes.add(barcodeKey);
    }
    if (Object.keys(variant.attributes).length > 8) {
      ctx.addIssue({ code: "custom", path: ["variants", index, "attributes"], message: "A variant can have at most eight attributes." });
    }
  });

  const primaryImages = data.images.filter((image) => image.isPrimary).length;
  if (primaryImages > 1) ctx.addIssue({ code: "custom", path: ["images"], message: "Only one product image can be primary." });
  data.images.forEach((image, index) => {
    if (image.variantId && !variantIds.has(image.variantId)) {
      ctx.addIssue({ code: "custom", path: ["images", index, "variantId"], message: "Image references an unknown variant." });
    }
  });

  const tierKeys = new Set<string>();
  const tiersByScope = new Map<string, Array<{ minimumQuantity: number; unitPrice: number; index: number }>>();
  data.priceTiers.forEach((tier, index) => {
    if (tier.variantId && !variantIds.has(tier.variantId)) {
      ctx.addIssue({ code: "custom", path: ["priceTiers", index, "variantId"], message: "Price tier references an unknown variant." });
      return;
    }
    const scope = tier.variantId || "product";
    const key = `${scope}:${tier.minimumQuantity}`;
    if (tierKeys.has(key)) ctx.addIssue({ code: "custom", path: ["priceTiers", index, "minimumQuantity"], message: "Duplicate quantity tier." });
    tierKeys.add(key);
    const base = tier.variantId ? variantPrices.get(tier.variantId) ?? data.basePrice : data.basePrice;
    if (tier.unitPrice > base) ctx.addIssue({ code: "custom", path: ["priceTiers", index, "unitPrice"], message: "Wholesale price cannot exceed its regular price." });
    const scoped = tiersByScope.get(scope) || [];
    scoped.push({ ...tier, index });
    tiersByScope.set(scope, scoped);
  });
  for (const tiers of tiersByScope.values()) {
    tiers.sort((left, right) => left.minimumQuantity - right.minimumQuantity);
    for (let index = 1; index < tiers.length; index += 1) {
      if (tiers[index].unitPrice > tiers[index - 1].unitPrice) {
        ctx.addIssue({ code: "custom", path: ["priceTiers", tiers[index].index, "unitPrice"], message: "Prices must stay equal or decrease as quantity increases." });
      }
    }
  }

  const inventoryKeys = new Set<string>();
  data.inventory.forEach((inventory, index) => {
    if (inventory.variantId && !variantIds.has(inventory.variantId)) {
      ctx.addIssue({ code: "custom", path: ["inventory", index, "variantId"], message: "Inventory references an unknown variant." });
    }
    if (data.variants.length > 0 && !inventory.variantId) {
      ctx.addIssue({ code: "custom", path: ["inventory", index, "variantId"], message: "Products with variants track inventory per variant." });
    }
    if (data.variants.length === 0 && inventory.variantId) {
      ctx.addIssue({ code: "custom", path: ["inventory", index, "variantId"], message: "This product has no variants." });
    }
    const key = `${inventory.warehouseId}:${inventory.variantId || "product"}`;
    if (inventoryKeys.has(key)) ctx.addIssue({ code: "custom", path: ["inventory", index], message: "Duplicate warehouse inventory row." });
    inventoryKeys.add(key);
  });
});

export type CatalogProductInput = z.infer<typeof catalogProductInputSchema>;

export const catalogListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["all", "draft", "published", "archived"]).default("all"),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const catalogCategoryInputSchema = z.object({
  parentId: z.string().uuid().nullable(),
  name: requiredText("Category name", 160),
  slug: requiredText("Category slug", 160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug."),
  description: optionalText(2_000),
  isActive: z.boolean().default(true),
});

export const catalogBulkStatusSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["draft", "published", "archived"]),
});

export function slugifyCatalogValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}
