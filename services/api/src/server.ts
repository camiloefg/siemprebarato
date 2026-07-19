import { config } from "./config.js";
import { createApp } from "./app.js";
import { pool } from "./db/pool.js";

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  console.log(`Siempre Barato API listening on http://${config.host}:${config.port}`);
  console.log(`Google OAuth configured: ${Boolean(config.google.clientId && config.google.clientSecret)}`);
  console.log(`Local development login enabled: ${config.allowDevAuthBypass}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; stopping API...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
