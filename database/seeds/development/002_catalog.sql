INSERT INTO catalog_categories (name, slug, description, display_order, is_active)
VALUES
  ('Despensa', 'despensa', 'Productos esenciales para todos los días.', 10, TRUE),
  ('Limpieza', 'limpieza', 'Soluciones prácticas para el hogar.', 20, TRUE),
  ('Bebidas', 'bebidas', 'Bebidas y formatos familiares.', 30, TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO warehouses (code, name, address, is_active)
VALUES ('SCL-01', 'Bodega Santiago', '{"city":"Santiago","region":"Región Metropolitana"}'::jsonb, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO catalog_products (
  category_id, sku, slug, name, brand, short_description, unit_type, sale_unit,
  base_price, compare_at_price, currency_code, tax_included, is_published, is_featured
)
SELECT c.id, values_row.sku, values_row.slug, values_row.name, values_row.brand,
       values_row.short_description, values_row.unit_type, values_row.sale_unit,
       values_row.base_price, values_row.compare_at_price, 'CLP', TRUE, TRUE, values_row.is_featured
FROM (
  VALUES
    ('SB-ARROZ-1K', 'arroz-grado-1-1kg', 'Arroz grado 1 · 1 kg', 'Siempre Barato', 'Grano largo, rendimiento familiar.', 'unit', 'unidad', 1590.00, 1890.00, TRUE, 'despensa'),
    ('SB-ACEITE-1L', 'aceite-vegetal-1l', 'Aceite vegetal · 1 L', 'Siempre Barato', 'Formato práctico para cocina diaria.', 'unit', 'unidad', 2290.00, NULL, TRUE, 'despensa'),
    ('SB-DETERG-3L', 'detergente-liquido-3l', 'Detergente líquido · 3 L', 'Casa Clara', 'Limpieza concentrada, aroma fresco.', 'unit', 'unidad', 3990.00, 4490.00, FALSE, 'limpieza'),
    ('SB-BEBIDA-3L', 'bebida-cola-3l', 'Bebida cola · 3 L', 'Refresco', 'Formato familiar retornable.', 'unit', 'unidad', 2490.00, NULL, FALSE, 'bebidas'),
    ('SB-AZUCAR-KG', 'azucar-granulada-por-kilo', 'Azúcar granulada · por kg', 'Siempre Barato', 'Venta por peso desde 500 gramos.', 'weight', 'kg', 1290.00, NULL, FALSE, 'despensa'),
    ('SB-PAPEL-12', 'papel-higienico-12-rollos', 'Papel higiénico · 12 rollos', 'Casa Clara', 'Doble hoja, paquete familiar.', 'unit', 'pack', 4990.00, 5490.00, TRUE, 'limpieza')
) AS values_row(sku, slug, name, brand, short_description, unit_type, sale_unit, base_price, compare_at_price, is_featured, category_slug)
JOIN catalog_categories c ON c.slug = values_row.category_slug
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_products p WHERE LOWER(p.sku) = LOWER(values_row.sku)
);

INSERT INTO catalog_price_tiers (product_id, variant_id, minimum_quantity, unit_price)
SELECT p.id, NULL, tier.minimum_quantity, tier.unit_price
FROM catalog_products p
JOIN (
  VALUES
    ('SB-ARROZ-1K', 6.000, 1450.00),
    ('SB-ARROZ-1K', 12.000, 1350.00),
    ('SB-ACEITE-1L', 6.000, 2090.00),
    ('SB-ACEITE-1L', 12.000, 1950.00),
    ('SB-DETERG-3L', 4.000, 3690.00),
    ('SB-BEBIDA-3L', 6.000, 2250.00),
    ('SB-AZUCAR-KG', 10.000, 1150.00),
    ('SB-PAPEL-12', 4.000, 4590.00)
) AS tier(sku, minimum_quantity, unit_price)
  ON p.sku = tier.sku
WHERE NOT EXISTS (
  SELECT 1
  FROM catalog_price_tiers existing
  WHERE existing.product_id = p.id
    AND existing.variant_id IS NULL
    AND existing.minimum_quantity = tier.minimum_quantity
);

INSERT INTO inventory_levels (warehouse_id, product_id, variant_id, on_hand, reserved, reorder_point)
SELECT w.id, p.id, NULL, 100, 0, 12
FROM warehouses w
CROSS JOIN catalog_products p
WHERE w.code = 'SCL-01'
  AND NOT EXISTS (
    SELECT 1
    FROM inventory_levels inventory
    WHERE inventory.warehouse_id = w.id
      AND inventory.product_id = p.id
      AND inventory.variant_id IS NULL
  );

INSERT INTO catalog_product_variants (
  id, product_id, sku, barcode, name, attributes, price_override, weight_grams, is_active
)
SELECT variant.id::uuid, products.id, variant.sku, variant.barcode, variant.name,
       variant.attributes::jsonb, variant.price_override, variant.weight_grams, TRUE
FROM catalog_products products
JOIN (
  VALUES
    ('10000000-0000-4000-8000-000000000011', 'SB-BEBIDA-3L', 'SB-BEBIDA-3L-CLASICA', '780000000011', 'Clásica', '{"Sabor":"Clásica"}', NULL::numeric, 3000),
    ('10000000-0000-4000-8000-000000000012', 'SB-BEBIDA-3L', 'SB-BEBIDA-3L-ZERO', '780000000012', 'Zero', '{"Sabor":"Zero"}', 2590.00, 3000)
) AS variant(id, product_sku, sku, barcode, name, attributes, price_override, weight_grams)
  ON products.sku = variant.product_sku
ON CONFLICT (id) DO UPDATE SET
  sku = EXCLUDED.sku,
  barcode = EXCLUDED.barcode,
  name = EXCLUDED.name,
  attributes = EXCLUDED.attributes,
  price_override = EXCLUDED.price_override,
  weight_grams = EXCLUDED.weight_grams,
  is_active = TRUE;

DELETE FROM inventory_levels levels
USING catalog_products products
WHERE levels.product_id = products.id
  AND products.sku = 'SB-BEBIDA-3L'
  AND levels.variant_id IS NULL
  AND levels.reserved = 0;

INSERT INTO inventory_levels (warehouse_id, product_id, variant_id, on_hand, reserved, reorder_point)
SELECT warehouses.id, products.id, variants.id, seed.on_hand, 0, 10
FROM warehouses
JOIN catalog_products products ON products.sku = 'SB-BEBIDA-3L'
JOIN catalog_product_variants variants ON variants.product_id = products.id
JOIN (
  VALUES
    ('SB-BEBIDA-3L-CLASICA', 70.000),
    ('SB-BEBIDA-3L-ZERO', 45.000)
) AS seed(variant_sku, on_hand) ON variants.sku = seed.variant_sku
WHERE warehouses.code = 'SCL-01'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_levels existing
    WHERE existing.warehouse_id = warehouses.id
      AND existing.product_id = products.id
      AND existing.variant_id = variants.id
  );

INSERT INTO catalog_price_tiers (product_id, variant_id, minimum_quantity, unit_price)
SELECT products.id, variants.id, tier.minimum_quantity, tier.unit_price
FROM catalog_products products
JOIN catalog_product_variants variants ON variants.product_id = products.id
JOIN (
  VALUES
    ('SB-BEBIDA-3L-ZERO', 6.000, 2350.00),
    ('SB-BEBIDA-3L-ZERO', 12.000, 2190.00)
) AS tier(variant_sku, minimum_quantity, unit_price) ON variants.sku = tier.variant_sku
WHERE products.sku = 'SB-BEBIDA-3L'
  AND NOT EXISTS (
    SELECT 1 FROM catalog_price_tiers existing
    WHERE existing.product_id = products.id
      AND existing.variant_id = variants.id
      AND existing.minimum_quantity = tier.minimum_quantity
  );
