import "../load-env.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = process.env.MIGRATIONS_DIR || path.resolve(currentDir, "../../../../database/migrations");

async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const filenames = (await fs.readdir(migrationsDir))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  for (const filename of filenames) {
    const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE filename = $1",
      [filename],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration changed on disk: ${filename}`);
      }
      console.log(`Already applied: ${filename}`);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [filename, checksum],
      );
      await client.query("COMMIT");
      console.log(`Applied: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exitCode = 1;
  });
