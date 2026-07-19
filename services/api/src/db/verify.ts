import { pool } from "./pool.js";

const requiredTables = [
  "admin_users",
  "admin_sessions",
  "audit_events",
  "catalog_categories",
  "catalog_products",
  "catalog_product_variants",
  "catalog_price_tiers",
  "warehouses",
  "inventory_levels",
  "inventory_reservations",
  "catalog_product_images",
  "inventory_movements",
  "catalog_product_events",
  "mercadolibre_research_settings",
  "mercadolibre_research_categories",
  "mercadolibre_research_runs",
  "mercadolibre_research_run_categories",
  "mercadolibre_research_snapshots",
  "mercadolibre_research_candidates",
] as const;

async function verify(): Promise<void> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [requiredTables],
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((table) => !found.has(table));
  if (missing.length) {
    throw new Error(`Missing database tables: ${missing.join(", ")}`);
  }

  const admin = await pool.query<{ email: string }>(
    "SELECT email FROM admin_users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE",
    [process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || "camiloefg@gmail.com"],
  );
  if (!admin.rowCount) {
    throw new Error("Bootstrap super administrator is missing.");
  }

  const researchSettings = await pool.query(
    "SELECT 1 FROM mercadolibre_research_settings WHERE id = 1 AND site_id = 'MLC'",
  );
  if (!researchSettings.rowCount) {
    throw new Error("Mercado Libre Chile research settings are missing.");
  }

  console.log(`Database verified (${requiredTables.length} required tables).`);
}

verify()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exitCode = 1;
  });
