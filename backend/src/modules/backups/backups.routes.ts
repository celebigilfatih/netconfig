import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { env } from "../../config/env.js";
import fs from "node:fs";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import child_process from "node:child_process";
import net from "node:net";
import { decryptSecret } from "../../infra/security/aes.js";

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
  async function insertErrorLog(request: FastifyRequest, data: { statusCode?: number; errorCode: string; message: string; stack?: string | null; tenantId?: string | null; deviceId?: string | null; executionId?: string | null; urlOverride?: string; methodOverride?: string; requestBody?: any; requestQuery?: any; severity?: string }) {
    try {
      const user: any = (request as any).user || null;
      const tenantId: string | null = (data.tenantId ?? null) ?? (user?.tenantId ?? null);
      const userId: string | null = user?.sub ?? null;
      await db.query(
        `INSERT INTO error_logs (tenant_id, user_id, device_id, execution_id, method, url, status_code, error_code, message, stack, request_body, request_query, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          tenantId,
          userId,
          data.deviceId ?? null,
          data.executionId ?? null,
          String(data.methodOverride || (request as any).method),
          String(data.urlOverride || (request as any).url),
          Number(data.statusCode ?? 0),
          String(data.errorCode),
          String(data.message),
          data.stack ? String(data.stack) : null,
          data.requestBody ? JSON.stringify(data.requestBody) : null,
          data.requestQuery ? JSON.stringify(data.requestQuery) : null,
          data.severity ?? (Number(data.statusCode ?? 0) >= 500 ? "critical" : "normal"),
        ]
      );
      const sev = data.severity ?? (Number(data.statusCode ?? 0) >= 500 ? "critical" : "normal");
      if (env.ERROR_ALERT_WEBHOOK_URL && sev === "critical") {
        const payload = {
          text: `Kritik hata: ${String(data.methodOverride || (request as any).method)} ${String(data.urlOverride || (request as any).url)} ${Number(data.statusCode ?? 0)} ${String(data.message)}`,
          meta: {
            tenantId,
            userId,
            deviceId: data.deviceId ?? null,
            executionId: data.executionId ?? null,
            statusCode: Number(data.statusCode ?? 0),
            errorCode: String(data.errorCode),
          },
        };
        try { await fetch(env.ERROR_ALERT_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch {}
      }
    } catch {}
  }

  async function insertStepLog(data: { executionId: string; deviceId: string; stepKey: string; status: string; detail?: string | null; meta?: any }) {
    try {
      await db.query(
        `INSERT INTO backup_step_logs (execution_id, device_id, step_key, status, detail, meta)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.executionId, data.deviceId, data.stepKey, data.status, data.detail ?? null, data.meta ? JSON.stringify(data.meta) : null]
      );
    } catch {}
  }

  function getDiskInfo(root: string): { availableKB?: number; capacity?: string } {
    try {
      const out = child_process.execSync(`df -Pk ${root}`, { encoding: "utf8" });
      const lines = out.trim().split(/\r?\n/);
      const last = lines[lines.length - 1].split(/\s+/);
      const availableKB = Number(last[3]);
      const capacity = String(last[4]);
      return { availableKB, capacity };
    } catch {
      return {};
    }
  }

  async function checkTcp(host: string, port: number, timeoutMs = 1500): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      let settled = false;
      try {
        const sock = net.createConnection({ host, port });
        const to = setTimeout(() => {
          if (!settled) {
            settled = true;
            try { sock.destroy(); } catch {}
            resolve({ ok: false, error: "ETIMEDOUT" });
          }
        }, timeoutMs);
        sock.on("connect", () => {
          clearTimeout(to);
          if (!settled) {
            settled = true;
            try { sock.end(); } catch {}
            resolve({ ok: true });
          }
        });
        sock.on("error", (err: any) => {
          clearTimeout(to);
          const code = err && (err.code || err.message) ? String(err.code || err.message) : "ECONNERROR";
          if (!settled) {
            settled = true;
            resolve({ ok: false, error: code });
          }
        });
      } catch (err: any) {
        const code = err && (err.code || err.message) ? String(err.code || err.message) : "ECONNERROR";
        resolve({ ok: false, error: code });
      }
    });
  }
  const payloadSchema = z.object({
    deviceId: z.string().uuid(),
    tenantId: z.string().uuid().optional(),
    vendor: z.enum(["fortigate", "cisco_ios", "mikrotik", "hp_comware"]),
    backupTimestamp: z.string(),
    configPath: z.string().min(1).nullable(),
    configSha256: z.string().length(64).or(z.literal("")),
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
      const ts = new Date(body.backupTimestamp);
      const userTenant = (request.user as any)?.tenantId as string | undefined;
      const tenantId = body.tenantId ?? userTenant;
      if (!tenantId) {
        return reply.status(400).send({ message: "tenantId is required" });
      }
      const root = env.BACKUP_ROOT_DIR || "/data/backups";
      const fallbackName = `FAILED_${ts.toISOString().replace(/[:.]/g, "")}.txt`;
      const fallbackPath = path.join(
        root,
        tenantId,
        body.deviceId,
        String(ts.getUTCFullYear()),
        String(ts.getUTCMonth() + 1).padStart(2, "0"),
        String(ts.getUTCDate()).padStart(2, "0"),
        fallbackName
      );
      const configPath = body.configPath ?? fallbackPath;
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SELECT id FROM devices WHERE id = $1 FOR UPDATE`, [body.deviceId]);
        const status = body.success ? "success" : "failed";
        if (!body.executionId) {
          const dupRes = await client.query(
            `SELECT id
             FROM device_backups
             WHERE tenant_id = $1
               AND device_id = $2
               AND config_sha256 = $3
               AND ABS(EXTRACT(EPOCH FROM (backup_timestamp - $4::timestamptz))) < 120
             ORDER BY backup_timestamp DESC
             LIMIT 1
             FOR UPDATE SKIP LOCKED`,
            [tenantId, body.deviceId, body.configSha256, body.backupTimestamp]
          );
          if (dupRes.rowCount && dupRes.rows[0]?.id) {
            const existingId = String(dupRes.rows[0].id);
            await client.query("COMMIT");
            const existsDup = fs.existsSync(configPath);
            await insertStepLog({ executionId: "00000000-0000-0000-0000-000000000000", deviceId: body.deviceId, stepKey: "report_received", status, detail: body.errorMessage ?? null, meta: { configPath, sizeBytes: body.configSizeBytes, sha256: body.configSha256, dedupSha256: true } });
            await insertStepLog({ executionId: "00000000-0000-0000-0000-000000000000", deviceId: body.deviceId, stepKey: "postcheck_file", status: existsDup ? "success" : "failed", detail: existsDup ? null : "config file missing", meta: { path: configPath } });
            return reply.status(200).send({ id: existingId });
          }
        }
        if (body.executionId) {
          const lockRes = await client.query(
            `SELECT id, backup_id, status FROM backup_executions WHERE id = $1 FOR UPDATE`,
            [body.executionId]
          );
          if (Array.isArray(lockRes.rows) && lockRes.rows.length > 0) {
            const row: any = lockRes.rows[0];
            if (row.backup_id) {
              await client.query("COMMIT");
              const existsDup = fs.existsSync(configPath);
              await insertStepLog({ executionId: body.executionId, deviceId: body.deviceId, stepKey: "report_received", status: row.status || status, detail: body.errorMessage ?? null, meta: { configPath, sizeBytes: body.configSizeBytes, sha256: body.configSha256, dedup: true } });
              await insertStepLog({ executionId: body.executionId, deviceId: body.deviceId, stepKey: "postcheck_file", status: existsDup ? "success" : "failed", detail: existsDup ? null : "config file missing", meta: { path: configPath } });
              return reply.status(200).send({ id: String(row.backup_id) });
            }
          }
        }
        const insertBackup = await client.query(
          `INSERT INTO device_backups (
            tenant_id, device_id, job_id, backup_timestamp, config_path, config_sha256, config_size_bytes, created_by, is_success, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9)
          RETURNING id`,
          [
            tenantId,
            body.deviceId,
            body.jobId ?? null,
            body.backupTimestamp,
            configPath,
            body.configSha256,
            body.configSizeBytes,
            body.success,
            body.errorMessage ?? null,
          ]
        );
        const backupId = insertBackup.rows[0].id as string;
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
        await client.query("COMMIT");
        if (body.executionId) {
          await insertStepLog({ executionId: body.executionId, deviceId: body.deviceId, stepKey: "report_received", status, detail: body.errorMessage ?? null, meta: { configPath, sizeBytes: body.configSizeBytes, sha256: body.configSha256 } });
        }

        const exists = fs.existsSync(configPath);
        await insertStepLog({ executionId: body.executionId ?? "00000000-0000-0000-0000-000000000000", deviceId: body.deviceId, stepKey: "postcheck_file", status: exists ? "success" : "failed", detail: exists ? null : "config file missing", meta: { path: configPath } });
        if (!body.success) {
          await insertErrorLog(request, { tenantId, statusCode: 200, errorCode: "backup_failed", message: body.errorMessage ?? "Backup failed", deviceId: body.deviceId, executionId: body.executionId ?? null, requestBody: body, severity: "critical" });
        }
        return reply.status(201).send({ id: backupId });
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        throw err;
      } finally {
        client.release();
      }
    }
  );

  const stepSchema = z.object({
    deviceId: z.string().uuid(),
    executionId: z.string().uuid().optional(),
    stepKey: z.string().min(1),
    status: z.string().min(1),
    detail: z.string().nullable().optional(),
    meta: z.any().optional(),
  });
  app.post(
    "/internal/backups/step",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const b = stepSchema.parse(request.body);
      await insertStepLog({ executionId: b.executionId ?? "00000000-0000-0000-0000-000000000000", deviceId: b.deviceId, stepKey: b.stepKey, status: b.status, detail: b.detail ?? null, meta: b.meta });
      return reply.status(201).send({ ok: true });
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

  app.get(
    "/executions/by-id/:id",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const pSchema = z.object({ id: z.string().uuid() });
      const p = pSchema.safeParse(request.params);
      if (!p.success) {
        return reply.status(400).send({ message: "Invalid executionId", errors: p.error.issues });
      }
      const execId = p.data.id;
      const userTenant = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT e.id, e.job_id, e.status, e.started_at, e.completed_at, e.error_message, e.backup_id
           FROM backup_executions e
           JOIN devices d ON d.id = e.device_id
           WHERE e.id = $1 AND d.tenant_id = $2
           LIMIT 1`,
          [execId, userTenant]
        );
        if (res.rowCount === 0) {
          return reply.status(404).send({ message: "Execution not found" });
        }
        return reply.send(res.rows[0]);
      } finally {
        client.release();
      }
    }
  );

  const manualSchema = z.object({ deviceId: z.string().uuid(), simulate: z.coerce.boolean().optional() });
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
        await client.query("BEGIN");
        const existing = await client.query(
          `SELECT be.id
           FROM backup_executions be
           JOIN devices d ON d.id = be.device_id
           WHERE be.device_id = $1 AND d.tenant_id = $2 AND be.status IN ('pending','running')
           ORDER BY be.started_at DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED`,
          [body.deviceId, userTenant]
        );
        if (existing.rowCount && existing.rows[0]?.id) {
          const executionId = String(existing.rows[0].id);
          await client.query("COMMIT");
          await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "execution_created", status: "success", detail: null, meta: { reused: true } });
          return reply.status(200).send({ executionId });
        }
        const devRes = await client.query(
          `SELECT id, hostname, mgmt_ip::text AS mgmt_ip, ssh_port, vendor FROM devices WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
          [body.deviceId, userTenant]
        );
        if (devRes.rowCount === 0) {
          await insertErrorLog(request, { statusCode: 404, errorCode: "device_not_found", message: "Device not found", deviceId: body.deviceId, requestBody: body });
          await client.query("ROLLBACK");
          return reply.status(404).send({ message: "Device not found" });
        }
        const rawIp = String(devRes.rows[0].mgmt_ip || "");
        const hostname = String(devRes.rows[0].hostname || "");
        const vendor = String(devRes.rows[0].vendor || "");
        const host = rawIp.replace(/\/\d+$/, "");
        const port = Number(devRes.rows[0].ssh_port);
        const root = env.BACKUP_ROOT_DIR || "/data/backups";
        try { fs.mkdirSync(root, { recursive: true }); } catch {}
        const meta: any = { root };
        try { fs.accessSync(root, fs.constants.R_OK | fs.constants.W_OK); meta.perms = "rw"; } catch { meta.perms = "no_rw"; }
        const disk = getDiskInfo(root);
        meta.disk = disk;
        const hasSpace = typeof disk.availableKB === "number" ? disk.availableKB > 10 * 1024 : true;
        if (!hasSpace || meta.perms !== "rw") {
          await insertErrorLog(request, { statusCode: 500, errorCode: !hasSpace ? "disk_space_low" : "no_write_permission", message: !hasSpace ? "Insufficient disk space" : "Backup root not writable", deviceId: body.deviceId, requestBody: body, severity: "critical" });
        }
        let netRes = await checkTcp(host, port, 1500);
        if (!netRes.ok && hostname) {
          const alt = await checkTcp(hostname, port, 1500);
          if (alt.ok) netRes = alt;
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
        await client.query("COMMIT");
        await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "precheck", status: hasSpace && meta.perms === "rw" ? "success" : "failed", detail: hasSpace ? (meta.perms === "rw" ? null : "no write permission") : "low disk space", meta });
        await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "network_check", status: netRes.ok ? "success" : "failed", detail: netRes.ok ? null : (netRes.error ?? "tcp connect failed"), meta: { host, hostname, port } });
        await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "execution_created", status: "success", detail: null, meta: { jobId, simulate: body.simulate === true } });
        try {
          const creds = await db.query(
            `SELECT username, password_encrypted, password_iv, secret_encrypted, secret_iv FROM device_credentials WHERE device_id = $1 LIMIT 1`,
            [body.deviceId]
          );
          const row = creds.rows[0] || {};
          const username = String(row.username || "");
          const password = row.password_encrypted && row.password_iv ? decryptSecret(row.password_encrypted, row.password_iv) : "";
          const secret = row.secret_encrypted && row.secret_iv ? decryptSecret(row.secret_encrypted, row.secret_iv) : null;
          const repoRoot = path.resolve(process.cwd(), "..");
          const scriptPath = path.join(repoRoot, "automation", "src", "automation", "services", "backup_runner.py");
          const envs: NodeJS.ProcessEnv = {
            ...process.env,
            API_BASE_URL: process.env.API_BASE_URL || "http://127.0.0.1:3001",
            AUTOMATION_SERVICE_TOKEN: env.AUTOMATION_SERVICE_TOKEN || "",
            BACKUP_ROOT_DIR: root,
            EXECUTION_ID: executionId,
            DEVICE_ID: body.deviceId,
            TENANT_ID: userTenant,
            DEVICE_HOSTNAME: hostname,
            DEVICE_IP: host,
            DEVICE_SSH_PORT: String(port),
            DEVICE_USERNAME: username,
            DEVICE_PASSWORD: password || "",
            DEVICE_TIMEOUT_SECONDS: String(meta.perms === "rw" ? 30 : 45),
            DEVICE_VENDOR: vendor || "fortigate",
            SIMULATE_BACKUP: body.simulate === true ? "1" : "0",
            PYTHONPATH: path.join(repoRoot, "automation", "src"),
          };
          const child = child_process.spawn("python3", [scriptPath], { env: envs, detached: true, stdio: "ignore" });
          child.unref();
          await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "inline_runner_spawned", status: "success", detail: null, meta: { scriptPath } });
        } catch (err: any) {
          await insertStepLog({ executionId, deviceId: body.deviceId, stepKey: "inline_runner_spawned", status: "failed", detail: String(err?.message || err), meta: {} });
          await insertErrorLog(request, { errorCode: "inline_runner_spawn_failed", message: String(err?.message || err), deviceId: body.deviceId, executionId, requestBody: { deviceId: body.deviceId }, severity: "critical" });
        }
        return reply.status(201).send({ executionId });
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        throw err;
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/backups/:id/download",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) {
        return reply.status(400).send({ message: "Invalid backupId", errors: p.error.issues });
      }
      const backupId = p.data.id;
      const userTenant = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT device_id, tenant_id, config_path, config_size_bytes, is_success
           FROM device_backups WHERE id = $1`,
          [backupId]
        );
        if (res.rowCount === 0) return reply.status(404).send({ message: "Backup not found" });
        const row = res.rows[0] as any;
        if (String(row.tenant_id) !== String(userTenant)) return reply.status(403).send({ message: "Forbidden" });
        if (!row.is_success) return reply.status(400).send({ message: "Backup failed" });
        const filePath = String(row.config_path);
        if (!filePath || !fs.existsSync(filePath)) return reply.status(404).send({ message: "File not found" });
        reply.header("Content-Type", "text/plain; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename=\"config_${row.device_id}.txt\"`);
        return reply.send(fs.createReadStream(filePath));
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/backups/:id/restore",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) {
        return reply.status(400).send({ message: "Invalid backupId", errors: p.error.issues });
      }
      const backupId = p.data.id;
      const userTenant = (request.user as any)?.tenantId as string;
      const roles: string[] = (request.user as any)?.roles ?? [];
      if (!roles.includes("admin") && !roles.includes("operator")) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      const client = await db.connect();
      try {
        const b = await client.query(
          `SELECT device_id, tenant_id, is_success FROM device_backups WHERE id = $1`,
          [backupId]
        );
        if (b.rowCount === 0) return reply.status(404).send({ message: "Backup not found" });
        const deviceId = String(b.rows[0].device_id);
        const tenantId = String(b.rows[0].tenant_id);
        const ok = !!b.rows[0].is_success;
        if (tenantId !== userTenant) return reply.status(403).send({ message: "Forbidden" });
        if (!ok) return reply.status(400).send({ message: "Backup not successful" });
        const jobRes = await client.query(
          `SELECT id FROM backup_jobs WHERE tenant_id = $1 AND device_id = $2 AND is_manual_only = true LIMIT 1`,
          [tenantId, deviceId]
        );
        let jobId: string;
        if (jobRes.rowCount && jobRes.rows[0]?.id) {
          jobId = String(jobRes.rows[0].id);
        } else {
          const insJob = await client.query(
            `INSERT INTO backup_jobs (tenant_id, device_id, name, schedule_cron, is_manual_only, is_enabled)
             VALUES ($1, $2, $3, NULL, true, true) RETURNING id`,
            [tenantId, deviceId, "Manual"]
          );
          jobId = String(insJob.rows[0].id);
        }
        const execRes = await client.query(
          `INSERT INTO backup_executions (job_id, device_id, started_at, status, backup_id)
           VALUES ($1, $2, now(), 'pending', $3) RETURNING id`,
          [jobId, deviceId, backupId]
        );
        const executionId = String(execRes.rows[0].id);
        return reply.status(201).send({ executionId });
      } finally {
        client.release();
      }
    }
  );

  app.post(
    "/errors",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const bodySchema = z.object({
        route: z.string(),
        method: z.string(),
        statusCode: z.number().int().nonnegative().optional(),
        code: z.string(),
        message: z.string(),
        stack: z.string().optional(),
        deviceId: z.string().uuid().optional(),
        executionId: z.string().uuid().optional(),
        requestBody: z.any().optional(),
        requestQuery: z.any().optional(),
      });
      const b = bodySchema.parse(request.body);
      await insertErrorLog(request, {
        statusCode: b.statusCode,
        errorCode: b.code,
        message: b.message,
        stack: b.stack ?? null,
        deviceId: b.deviceId ?? null,
        executionId: b.executionId ?? null,
        urlOverride: b.route,
        methodOverride: b.method,
        requestBody: b.requestBody,
        requestQuery: b.requestQuery,
      });
      return reply.status(201).send({ ok: true });
    }
  );

  app.get(
    "/errors/recent",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const qSchema = z.object({ limit: z.coerce.number().int().positive().default(20), offset: z.coerce.number().int().nonnegative().default(0) });
      const q = qSchema.parse(request.query);
      const res = await db.query(
        `SELECT id, device_id, execution_id, method, url, status_code, error_code, message, created_at
         FROM error_logs WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [tenantId, q.limit, q.offset]
      );
      return reply.send({ items: res.rows });
    }
  );

  app.get(
    "/backup_steps/:deviceId",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const pSchema = z.object({ deviceId: z.string().uuid() });
      const qSchema = z.object({ limit: z.coerce.number().int().positive().default(20), offset: z.coerce.number().int().nonnegative().default(0), executionId: z.string().uuid().optional() });
      const p = pSchema.parse(request.params);
      const q = qSchema.parse(request.query);
      const res = await db.query(
        `SELECT bsl.id, bsl.execution_id, bsl.step_key, bsl.status, bsl.detail, bsl.meta, bsl.created_at
         FROM backup_step_logs bsl
         JOIN devices d ON d.id = bsl.device_id
         WHERE bsl.device_id = $1 AND d.tenant_id = $2 ${q.executionId ? "AND bsl.execution_id = $3" : ""}
         ORDER BY bsl.created_at DESC
         LIMIT ${q.executionId ? "$4" : "$3"} OFFSET ${q.executionId ? "$5" : "$4"}`,
        q.executionId ? [p.deviceId, tenantId, q.executionId, q.limit, q.offset] : [p.deviceId, tenantId, q.limit, q.offset]
      );
      return reply.send({ items: res.rows });
    }
  );
}
