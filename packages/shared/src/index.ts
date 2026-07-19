export const ADMIN_ROLES = [
  "super_admin",
  "admin",
  "catalog_manager",
  "order_manager",
  "support",
  "viewer",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Superadministrador",
  admin: "Administrador",
  catalog_manager: "Catálogo",
  order_manager: "Pedidos",
  support: "Soporte",
  viewer: "Solo lectura",
};

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  googleLinked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WholesalePriceTier = {
  minimumQuantity: number;
  unitPrice: number;
};

export type CatalogProductVariant = {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  availableQuantity: number;
  wholesaleTiers: WholesalePriceTier[];
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  saleUnit: string;
  unitType: "unit" | "weight";
  basePrice: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  availableQuantity: number;
  minimumQuantity: number;
  quantityIncrement: number;
  wholesaleTiers: WholesalePriceTier[];
  variants: CatalogProductVariant[];
};
