import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import authRouter from "./routes/auth.js";
import adminUsersRouter from "./routes/admin-users.js";
import adminAuditRouter from "./routes/admin-audit.js";
import publicCatalogRouter from "./routes/public-catalog.js";
import adminCatalogRouter from "./routes/admin-catalog.js";
import adminResearchRouter from "./routes/admin-research.js";

export function createApp() {
  const app = express();
  if (config.isProduction) app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: config.isProduction ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    const origin = String(req.get("origin") || "");
    const allowedOrigins = new Set([config.adminAppUrl, config.storefrontAppUrl]);
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "content-type,x-csrf-token");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
    }),
  );

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ success: true, service: "siemprebarato-api", database: "available" });
    } catch {
      res.status(503).json({ success: false, service: "siemprebarato-api", database: "unavailable" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin/users", adminUsersRouter);
  app.use("/api/admin/audit", adminAuditRouter);
  app.use("/api/admin/catalog", adminCatalogRouter);
  app.use("/api/admin/research", adminResearchRouter);
  app.use("/api/public/catalog", publicCatalogRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ success: false, message: "API route not found." });
  });

  return app;
}
