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
