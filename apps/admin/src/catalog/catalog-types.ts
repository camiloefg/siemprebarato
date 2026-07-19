export type CatalogStatus = "draft" | "published" | "archived";

export type CatalogCategory = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address: Record<string, string>;
  isActive: boolean;
};

export type AdminCatalogSummary = {
  id: string;
  version: number;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  basePrice: number;
  isFeatured: boolean;
  updatedAt: string;
  categoryId: string | null;
  category: string | null;
  imageUrl: string | null;
  availableQuantity: number;
  variantCount: number;
  status: CatalogStatus;
};

export type CatalogVariantDraft = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  attributes: Record<string, string>;
  priceOverride: number | null;
  weightGrams: number | null;
  isActive: boolean;
};

export type CatalogTierDraft = {
  id?: string;
  variantId: string | null;
  minimumQuantity: number;
  unitPrice: number;
};

export type CatalogImageDraft = {
  id?: string;
  imageUrl: string;
  altText: string;
  variantId: string | null;
  isPrimary: boolean;
};

export type CatalogInventoryDraft = {
  id?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  variantId: string | null;
  onHand: number;
  reserved?: number;
  available?: number;
  reorderPoint: number;
  reason: string;
};

export type CatalogEvent = {
  id: number;
  action: string;
  details: Record<string, unknown>;
  actorName: string;
  createdAt: string;
};

export type InventoryMovement = {
  id: number;
  variantId: string | null;
  warehouseCode: string;
  movementType: string;
  quantityDelta: number;
  onHandAfter: number;
  reason: string;
  actorName: string;
  createdAt: string;
};

export type CatalogProductDraft = {
  id?: string;
  version?: number;
  categoryId: string | null;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  shortDescription: string;
  description: string;
  unitType: "unit" | "weight";
  saleUnit: string;
  minimumQuantity: number;
  quantityIncrement: number;
  basePrice: number;
  compareAtPrice: number | null;
  taxIncluded: boolean;
  isFeatured: boolean;
  status: CatalogStatus;
  seoTitle: string;
  seoDescription: string;
  images: CatalogImageDraft[];
  variants: CatalogVariantDraft[];
  priceTiers: CatalogTierDraft[];
  inventory: CatalogInventoryDraft[];
  events?: CatalogEvent[];
  inventoryMovements?: InventoryMovement[];
  createdAt?: string;
  updatedAt?: string;
};

export const emptyCatalogProduct: CatalogProductDraft = {
  categoryId: null,
  sku: "",
  slug: "",
  name: "",
  brand: null,
  shortDescription: "",
  description: "",
  unitType: "unit",
  saleUnit: "unidad",
  minimumQuantity: 1,
  quantityIncrement: 1,
  basePrice: 0,
  compareAtPrice: null,
  taxIncluded: true,
  isFeatured: false,
  status: "draft",
  seoTitle: "",
  seoDescription: "",
  images: [],
  variants: [],
  priceTiers: [],
  inventory: [],
};

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function attributesToText(attributes: Record<string, string>): string {
  return Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join(", ");
}

export function textToAttributes(value: string): Record<string, string> {
  return value.split(",").reduce<Record<string, string>>((attributes, part) => {
    const separator = part.indexOf(":");
    if (separator < 1) return attributes;
    const key = part.slice(0, separator).trim();
    const itemValue = part.slice(separator + 1).trim();
    if (key) attributes[key] = itemValue;
    return attributes;
  }, {});
}
