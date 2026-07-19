import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

export const pool = new Pool({
  ...config.database,
  max: config.isProduction ? 20 : 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: "siemprebarato-api",
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});
