import "./load-env.js";

const isProduction = process.env.NODE_ENV === "production";

function integerValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredProductionSecret(name: string, developmentFallback: string): string {
  const value = String(process.env[name] || "").trim();
  if (isProduction && value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters in production.`);
  }
  return value || developmentFallback;
}

const dbHost = process.env.DB_HOST || "127.0.0.1";
const allowDevAuthBypass =
  !isProduction &&
  process.env.ALLOW_DEV_AUTH_BYPASS === "true" &&
  ["127.0.0.1", "localhost", "::1"].includes(dbHost);

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction,
  host: process.env.API_HOST || "127.0.0.1",
  port: integerValue(process.env.API_PORT, 3020),
  adminAppUrl: process.env.ADMIN_APP_URL || "http://127.0.0.1:5178",
  storefrontAppUrl: process.env.STOREFRONT_APP_URL || "http://127.0.0.1:5179",
  database: {
    host: dbHost,
    port: integerValue(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || "siemprebarato_dev",
    user: process.env.DB_USER || "siemprebarato_app",
    password: process.env.DB_PASSWORD || "siemprebarato_local_only",
    ssl: isProduction ? { rejectUnauthorized: true } : false,
  },
  bootstrapSuperAdminEmail: String(
    process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || "camiloefg@gmail.com",
  )
    .trim()
    .toLowerCase(),
  authSessionPepper: requiredProductionSecret(
    "AUTH_SESSION_PEPPER",
    "siempre-barato-local-session-pepper-not-for-production",
  ),
  oauthStateSecret: requiredProductionSecret(
    "OAUTH_STATE_SECRET",
    "siempre-barato-local-oauth-state-secret-not-for-production",
  ),
  adminSessionTtlMs: integerValue(process.env.ADMIN_SESSION_TTL_HOURS, 12) * 60 * 60 * 1000,
  google: {
    clientId: String(process.env.GOOGLE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    callbackUrl:
      process.env.GOOGLE_CALLBACK_URL ||
      "http://127.0.0.1:3020/api/auth/google/callback",
  },
  mercadoLibre: {
    workerEnabled: process.env.MERCADOLIBRE_WORKER_ENABLED === "true",
    accessTokenConfigured: Boolean(String(process.env.MERCADOLIBRE_ACCESS_TOKEN || "").trim()),
    apiBaseUrl: process.env.MERCADOLIBRE_API_BASE_URL || "https://api.mercadolibre.com",
  },
  allowDevAuthBypass,
};

export type AppConfig = typeof config;
