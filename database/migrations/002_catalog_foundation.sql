CREATE TABLE IF NOT EXISTS catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_slug_uidx
  ON catalog_categories (LOWER(slug));
CREATE INDEX IF NOT EXISTS catalog_categories_parent_idx
  ON catalog_categories (parent_id, display_order);

DROP TRIGGER IF EXISTS catalog_categories_set_updated_at ON catalog_categories;
CREATE TRIGGER catalog_categories_set_updated_at
BEFORE UPDATE ON catalog_categories
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  unit_type TEXT NOT NULL DEFAULT 'unit' CHECK (unit_type IN ('unit', 'weight')),
  sale_unit TEXT NOT NULL DEFAULT 'unidad',
  base_price NUMERIC(14, 2) NOT NULL CHECK (base_price >= 0),
  compare_at_price NUMERIC(14, 2) CHECK (compare_at_price IS NULL OR compare_at_price >= base_price),
  currency_code CHAR(3) NOT NULL DEFAULT 'CLP',
  tax_included BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_sku_lower_uidx
  ON catalog_products (LOWER(sku));
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_slug_lower_uidx
  ON catalog_products (LOWER(slug));
CREATE INDEX IF NOT EXISTS catalog_products_public_idx
  ON catalog_products (is_published, category_id, name);

DROP TRIGGER IF EXISTS catalog_products_set_updated_at ON catalog_products;
CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS catalog_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_override NUMERIC(14, 2) CHECK (price_override IS NULL OR price_override >= 0),
  weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_variants_sku_lower_uidx
  ON catalog_product_variants (LOWER(sku));
CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_variants_barcode_uidx
  ON catalog_product_variants (barcode)
  WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS catalog_product_variants_product_idx
  ON catalog_product_variants (product_id, is_active);

DROP TRIGGER IF EXISTS catalog_product_variants_set_updated_at ON catalog_product_variants;
CREATE TRIGGER catalog_product_variants_set_updated_at
BEFORE UPDATE ON catalog_product_variants
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS catalog_price_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES catalog_product_variants(id) ON DELETE CASCADE,
  minimum_quantity NUMERIC(14, 3) NOT NULL CHECK (minimum_quantity > 1),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, variant_id, minimum_quantity)
);

CREATE INDEX IF NOT EXISTS catalog_price_tiers_lookup_idx
  ON catalog_price_tiers (product_id, variant_id, minimum_quantity);

DROP TRIGGER IF EXISTS catalog_price_tiers_set_updated_at ON catalog_price_tiers;
CREATE TRIGGER catalog_price_tiers_set_updated_at
BEFORE UPDATE ON catalog_price_tiers
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS warehouses_set_updated_at ON warehouses;
CREATE TRIGGER warehouses_set_updated_at
BEFORE UPDATE ON warehouses
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS inventory_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES catalog_product_variants(id) ON DELETE CASCADE,
  on_hand NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  reorder_point NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_levels_product_location_uidx
  ON inventory_levels (warehouse_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

DROP TRIGGER IF EXISTS inventory_levels_set_updated_at ON inventory_levels;
CREATE TRIGGER inventory_levels_set_updated_at
BEFORE UPDATE ON inventory_levels
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_level_id UUID NOT NULL REFERENCES inventory_levels(id) ON DELETE CASCADE,
  reservation_key TEXT NOT NULL UNIQUE,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'consumed', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_reservations_active_idx
  ON inventory_reservations (expires_at)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS inventory_reservations_set_updated_at ON inventory_reservations;
CREATE TRIGGER inventory_reservations_set_updated_at
BEFORE UPDATE ON inventory_reservations
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

