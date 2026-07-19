import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";
import { runResearchCycle } from "./research.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.SB_ENV_FILE || path.resolve(currentDir, "../../../.env") });

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number.parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "siemprebarato_dev",
  user: process.env.DB_USER || "siemprebarato_app",
  password: process.env.DB_PASSWORD || "siemprebarato_local_only",
  max: 2,
  application_name: "siemprebarato-mercadolibre-worker",
});

const externalEnabled = process.env.MERCADOLIBRE_WORKER_ENABLED === "true";
const accessToken = String(process.env.MERCADOLIBRE_ACCESS_TOKEN || "").trim();
const apiBaseUrl = process.env.MERCADOLIBRE_API_BASE_URL || "https://api.mercadolibre.com";
const pollMs = Math.max(10_000, Number.parseInt(process.env.MERCADOLIBRE_WORKER_POLL_MS || "60000", 10));
const workerId = `siemprebarato-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
let stopping = false;

async function heartbeat(status: string, details: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_name, status, details, last_seen_at)
     VALUES ('mercadolibre-research', $1, $2, NOW())
     ON CONFLICT (worker_name) DO UPDATE SET
       status = EXCLUDED.status,
       details = EXCLUDED.details,
       last_seen_at = NOW()`,
    [status, details],
  );
}

async function cycle(): Promise<void> {
  if (stopping) return;
  try {
    await heartbeat("checking", { workerId });
    const result = await runResearchCycle({ pool, workerId, externalEnabled, accessToken, apiBaseUrl });
    await heartbeat(result.status, { workerId, ...result.details });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker cycle failed.";
    console.error("Mercado Libre worker cycle failed:", message);
    await heartbeat("error", { workerId, error: message }).catch(() => undefined);
  }
  if (!stopping) setTimeout(() => void cycle(), pollMs).unref();
}

async function shutdown(signal: string): Promise<void> {
  stopping = true;
  console.log(`Received ${signal}; stopping Mercado Libre worker...`);
  await pool.end();
  process.exit(0);
}

console.log(`Mercado Libre research worker started (external requests enabled: ${externalEnabled}).`);
void cycle();
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
