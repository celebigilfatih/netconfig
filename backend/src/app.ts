import fastify, { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerBackupRoutes } from "./modules/backups/backups.routes.js";
import { registerDeviceRoutes } from "./modules/devices/devices.routes.js";
import { registerJobRoutes } from "./modules/jobs/jobs.routes.js";
import { registerStatsRoutes } from "./modules/stats/stats.routes.js";
import { registerVendorRoutes } from "./modules/vendors/vendors.routes.js";
import { registerMonitoringRoutes } from "./modules/monitoring/monitoring.routes.js";
import { registerAlarmRoutes } from "./modules/alarms/alarms.routes.js";
import { env } from "./config/env.js";
import { db } from "./infra/db/client.js";

export function buildApp(): FastifyInstance {
  const app = fastify({ logger: true });

  app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.register(cors, {
    origin: (origin, cb) => cb(null, true),
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
    credentials: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  app.setErrorHandler(async (error, request, reply) => {
    try {
      const user: any = (request as any).user || null;
      const tenantId: string | null = user?.tenantId ?? null;
      const userId: string | null = user?.sub ?? null;
      const status = (error as any).statusCode || 500;
      await db.query(
        `INSERT INTO error_logs (tenant_id, user_id, method, url, status_code, error_code, message, stack, request_body, request_query, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tenantId,
          userId,
          String(request.method),
          String(request.url),
          Number(status),
          status >= 500 ? "server_error" : "client_error",
          String(error.message || ""),
          String(error.stack || ""),
          request.body ? JSON.stringify(request.body) : null,
          request.query ? JSON.stringify(request.query) : null,
          status >= 500 ? "critical" : "normal",
        ]
      );
      if (env.ERROR_ALERT_WEBHOOK_URL && status >= 500) {
        const payload = {
          text: `Kritik hata: ${String(request.method)} ${String(request.url)} ${Number(status)} ${String(error.message || "")}`,
          meta: {
            tenantId,
            userId,
            method: String(request.method),
            url: String(request.url),
            statusCode: Number(status),
          },
        };
        try { await fetch(env.ERROR_ALERT_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch {}
      }
    } catch {}
    reply.status((error as any).statusCode || 500).send({ message: error.message });
  });

  registerAuthRoutes(app);
  registerBackupRoutes(app);
  registerDeviceRoutes(app);
  registerJobRoutes(app);
  registerStatsRoutes(app);
  registerVendorRoutes(app);
  registerMonitoringRoutes(app);
  registerAlarmRoutes(app);

  return app;
}
