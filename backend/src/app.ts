import fastify, { FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerBackupRoutes } from "./modules/backups/backups.routes.js";
import { registerDeviceRoutes } from "./modules/devices/devices.routes.js";
import { registerJobRoutes } from "./modules/jobs/jobs.routes.js";
import { env } from "./config/env.js";

export function buildApp(): FastifyInstance {
  const app = fastify({ logger: true });

  app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  app.register(cors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  registerAuthRoutes(app);
  registerBackupRoutes(app);
  registerDeviceRoutes(app);
  registerJobRoutes(app);

  return app;
}
