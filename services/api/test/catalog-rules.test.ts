import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductInputSchema, slugifyCatalogValue } from "../src/catalog-rules.js";

const variantId = "10000000-0000-4000-8000-000000000001";
const warehouseId = "20000000-0000-4000-8000-000000000001";

function validProduct() {
  return {
    categoryId: null,
    sku: "SB-TEST",
    slug: "producto-de-prueba",
    name: "Producto de prueba",
    brand: "Siempre Barato",
    shortDescription: "Producto válido para pruebas.",
    description: "",
    unitType: "unit" as const,
    saleUnit: "unidad",
    minimumQuantity: 1,
    quantityIncrement: 1,
    basePrice: 1990,
    compareAtPrice: 2290,
    taxIncluded: true,
    isFeatured: false,
    status: "draft" as const,
    seoTitle: "",
    seoDescription: "",
    images: [{ imageUrl: "https://example.com/producto.jpg", altText: "Producto", variantId, isPrimary: true }],
    variants: [{ id: variantId, sku: "SB-TEST-A", barcode: "780000000001", name: "Formato A", attributes: { Formato: "A" }, priceOverride: null, weightGrams: 1000, isActive: true }],
    priceTiers: [
      { variantId, minimumQuantity: 6, unitPrice: 1790 },
      { variantId, minimumQuantity: 12, unitPrice: 1690 },
    ],
    inventory: [{ warehouseId, variantId, onHand: 30, reorderPoint: 5, reason: "Stock inicial" }],
  };
}

test("catalog product accepts a complete variant, inventory, image, and wholesale price payload", () => {
  const parsed = catalogProductInputSchema.safeParse(validProduct());
  assert.equal(parsed.success, true);
});

test("catalog product rejects wholesale prices that increase at higher quantities", () => {
  const product = validProduct();
  product.priceTiers[1].unitPrice = 1890;
  const parsed = catalogProductInputSchema.safeParse(product);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues.map((issue) => issue.message).join(" "), /decrease/i);
});

test("catalog product rejects inventory that references an unknown variant", () => {
  const product = validProduct();
  product.inventory[0].variantId = "10000000-0000-4000-8000-000000000099";
  const parsed = catalogProductInputSchema.safeParse(product);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.match(parsed.error.issues.map((issue) => issue.message).join(" "), /unknown variant/i);
});

test("unit products require whole-number sale quantities", () => {
  const product = validProduct();
  product.quantityIncrement = 0.5;
  const parsed = catalogProductInputSchema.safeParse(product);
  assert.equal(parsed.success, false);
});

test("catalog slugification removes accents and unsafe URL characters", () => {
  assert.equal(slugifyCatalogValue("  Azúcar Rubia · 1 Kg  "), "azucar-rubia-1-kg");
});
