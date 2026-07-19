ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS minimum_quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
  ADD COLUMN IF NOT EXISTS quantity_increment NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (quantity_increment > 0),
  ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0);

UPDATE catalog_products
SET published_at = COALESCE(published_at, created_at)
WHERE is_published = TRUE;

UPDATE catalog_products
SET minimum_quantity = 0.5,
    quantity_increment = 0.5
WHERE unit_type = 'weight'
  AND minimum_quantity = 1
  AND quantity_increment = 1;

CREATE INDEX IF NOT EXISTS catalog_products_admin_status_idx
  ON catalog_products (archived_at, is_published, updated_at DESC);

CREATE TABLE IF NOT EXISTS catalog_product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES catalog_product_variants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_product_images_product_idx
  ON catalog_product_images (product_id, display_order, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_product_images_primary_uidx
  ON catalog_product_images (product_id)
  WHERE is_primary = TRUE;

DROP TRIGGER IF EXISTS catalog_product_images_set_updated_at ON catalog_product_images;
CREATE TRIGGER catalog_product_images_set_updated_at
BEFORE UPDATE ON catalog_product_images
FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();

INSERT INTO catalog_product_images (product_id, image_url, alt_text, display_order, is_primary)
SELECT id, image_url, name, 0, TRUE
FROM catalog_products
WHERE image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM catalog_product_images images WHERE images.product_id = catalog_products.id
  );

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  inventory_level_id UUID REFERENCES inventory_levels(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES catalog_product_variants(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'adjustment', 'reservation', 'release', 'sale', 'return', 'transfer')),
  quantity_delta NUMERIC(14, 3) NOT NULL CHECK (quantity_delta <> 0),
  on_hand_after NUMERIC(14, 3) NOT NULL CHECK (on_hand_after >= 0),
  reason TEXT NOT NULL DEFAULT '',
  actor_admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx
  ON inventory_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_level_idx
  ON inventory_movements (inventory_level_id, created_at DESC);

CREATE TABLE IF NOT EXISTS catalog_product_events (
  id BIGSERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  actor_admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_product_events_product_idx
  ON catalog_product_events (product_id, created_at DESC);
