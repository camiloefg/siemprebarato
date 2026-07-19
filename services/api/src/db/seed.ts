import "../load-env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { pool } from "./pool.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = process.env.DEVELOPMENT_SEEDS_DIR || path.resolve(currentDir, "../../../../database/seeds/development");

async function seed(): Promise<void> {
  if (config.isProduction || !["localhost", "127.0.0.1", "::1"].includes(config.database.host)) {
    throw new Error("Development seeds are restricted to local development databases.");
  }

  const filenames = (await fs.readdir(seedsDir))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  for (const filename of filenames) {
    const sql = await fs.readFile(path.join(seedsDir, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`Seeded: ${filename}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

seed()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await pool.end();
    process.exitCode = 1;
  });
