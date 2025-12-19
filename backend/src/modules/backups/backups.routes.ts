import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { env } from "../../config/env.js";
import fs from "node:fs";
import { createTwoFilesPatch } from "diff";

function requireAutomationAuth() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers.authorization;
    const rawToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (env.AUTOMATION_SERVICE_TOKEN && rawToken === env.AUTOMATION_SERVICE_TOKEN) {
      return;
    }
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  };
}

export function registerBackupRoutes(app: FastifyInstance): void {
  const payloadSchema = z.object({
    deviceId: z.string().uuid(),
    tenantId: z.string().uuid(),
    vendor: z.enum(["fortigate", "cisco_ios", "mikrotik"]),
    backupTimestamp: z.string(),
    configPath: z.string().min(1).nullable(),
    configSha256: z.string().length(64),
    configSizeBytes: z.number().int().nonnegative(),
    success: z.boolean(),
    errorMessage: z.string().nullable().optional(),
    jobId: z.string().uuid().nullable().optional(),
    executionId: z.string().uuid().nullable().optional(),
  });

  app.post(
    "/internal/backups/report",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const body = payloadSchema.parse(request.body);
      const client = await db.connect();
      try {
        const insertBackup = await client.query(
          `INSERT INTO device_backups (
            tenant_id, device_id, job_id, backup_timestamp, config_path, config_sha256, config_size_bytes, created_by, is_success, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
          RETURNING id`,
          [
            body.tenantId,
            body.deviceId,
            body.jobId ?? null,
            body.backupTimestamp,
            body.configPath,
            body.configSha256,
            body.configSizeBytes,
            body.success,
            body.errorMessage ?? null,
          ]
        );
        const backupId = insertBackup.rows[0].id as string;
        const status = body.success ? "success" : "failed";
        if (body.executionId) {
          await client.query(
            `UPDATE backup_executions SET completed_at = $1, status = $2, error_message = $3, backup_id = $4 WHERE id = $5`,
            [
              body.backupTimestamp,
              status,
              body.errorMessage ?? null,
              backupId,
              body.executionId,
            ]
          );
        } else if (body.jobId) {
          await client.query(
            `INSERT INTO backup_executions (
              job_id, device_id, completed_at, status, error_message, backup_id
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              body.jobId,
              body.deviceId,
              body.backupTimestamp,
              status,
              body.errorMessage ?? null,
              backupId,
            ]
          );
        }

        return reply.status(201).send({ id: backupId });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/backups/:deviceId/diff",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ deviceId: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) {
        return reply.status(400).send({ message: "Invalid deviceId", errors: p.error.issues });
      }
      const { deviceId } = p.data;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT id, config_path, backup_timestamp FROM device_backups
           WHERE device_id = $1 AND is_success = true
           ORDER BY backup_timestamp DESC
           LIMIT 2`,
          [deviceId]
        );
        if (!res.rowCount || res.rowCount < 2) {
          return reply.status(400).send({ message: "Not enough backups to diff" });
        }
        const a = res.rows[1];
        const b = res.rows[0];
        const aText = fs.readFileSync(a.config_path, "utf8");
        const bText = fs.readFileSync(b.config_path, "utf8");
        const patch = createTwoFilesPatch(
          String(a.config_path),
          String(b.config_path),
          aText,
          bText,
          String(a.backup_timestamp),
          String(b.backup_timestamp),
          { context: 3 }
        );
        return reply.send({ diff: patch });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/backups/:deviceId",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ deviceId: z.string().uuid() });
      const querySchema = z.object({
        limit: z.coerce
          .number()
          .int()
          .positive()
          .transform((n) => (n > 100 ? 100 : n))
          .default(20),
        offset: z.coerce.number().int().nonnegative().default(0),
        success: z.coerce.boolean().optional(),
      });
      const p2 = paramsSchema.safeParse(request.params);
      if (!p2.success) {
        return reply.status(400).send({ message: "Invalid deviceId", errors: p2.error.issues });
      }
      const { deviceId } = p2.data;
      const qParsed = querySchema.safeParse(request.query);
      if (!qParsed.success) {
        return reply.status(400).send({ message: "Invalid query", errors: qParsed.error.issues });
      }
      const { limit, offset, success } = qParsed.data;
      const client = await db.connect();
      try {
        const clauses: string[] = ["device_id = $1"];
        const params: any[] = [deviceId];
        let idx = 2;
        if (success !== undefined) { clauses.push(`is_success = $${idx}`); params.push(success); idx++; }
        const sql = `SELECT id, job_id, backup_timestamp, config_size_bytes, is_success, error_message
                     FROM device_backups WHERE ${clauses.join(" AND ")}
                     ORDER BY backup_timestamp DESC
                     LIMIT $${idx} OFFSET $${idx + 1}`;
        params.push(limit, offset);
        const res = await client.query(sql, params);
        return reply.send({ items: res.rows });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/executions/:deviceId",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ deviceId: z.string().uuid() });
      const querySchema = z.object({
        limit: z.coerce
          .number()
          .int()
          .positive()
          .transform((n) => (n > 100 ? 100 : n))
          .default(20),
        offset: z.coerce.number().int().nonnegative().default(0),
        status: z.enum(["pending", "running", "success", "failed", "skipped"]).optional(),
      });
      const p3 = paramsSchema.safeParse(request.params);
      if (!p3.success) {
        return reply.status(400).send({ message: "Invalid deviceId", errors: p3.error.issues });
      }
      const { deviceId } = p3.data;
      const qParsed = querySchema.safeParse(request.query);
      if (!qParsed.success) {
        return reply.status(400).send({ message: "Invalid query", errors: qParsed.error.issues });
      }
      const { limit, offset, status } = qParsed.data;
      const client = await db.connect();
      try {
        const clauses: string[] = ["device_id = $1"];
        const params: any[] = [deviceId];
        let idx = 2;
        if (status) { clauses.push(`status = $${idx}`); params.push(status); idx++; }
        const sql = `SELECT id, job_id, status, started_at, completed_at, error_message, backup_id
                     FROM backup_executions WHERE ${clauses.join(" AND ")}
                     ORDER BY started_at DESC
                     LIMIT $${idx} OFFSET $${idx + 1}`;
        params.push(limit, offset);
        const res = await client.query(sql, params);
        return reply.send({ items: res.rows });
      } finally {
        client.release();
      }
    }
  );

  const manualSchema = z.object({ deviceId: z.string().uuid() });
  app.post(
    "/backups/manual",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const user = request.user as any;
      const roles: string[] = user?.roles ?? [];
      if (!roles.includes("admin") && !roles.includes("operator")) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      const body = manualSchema.parse(request.body);
      const userTenant = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const devRes = await client.query(
          `SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
          [body.deviceId, userTenant]
        );
        if (devRes.rowCount === 0) {
          return reply.status(404).send({ message: "Device not found" });
        }
        const jobRes = await client.query(
          `SELECT id FROM backup_jobs WHERE tenant_id = $1 AND device_id = $2 AND is_manual_only = true LIMIT 1`,
          [userTenant, body.deviceId]
        );
        let jobId: string;
        if (jobRes.rowCount && jobRes.rows[0]?.id) {
          jobId = jobRes.rows[0].id as string;
        } else {
          const insJob = await client.query(
            `INSERT INTO backup_jobs (tenant_id, device_id, name, schedule_cron, is_manual_only, is_enabled)
             VALUES ($1, $2, $3, NULL, true, true) RETURNING id`,
            [userTenant, body.deviceId, "Manual"]
          );
          jobId = insJob.rows[0].id as string;
        }
        const execRes = await client.query(
          `INSERT INTO backup_executions (job_id, device_id, started_at, status)
           VALUES ($1, $2, now(), 'pending') RETURNING id`,
          [jobId, body.deviceId]
        );
        const executionId = execRes.rows[0].id as string;
        return reply.status(201).send({ executionId });
      } finally {
        client.release();
      }
    }
  );
}
