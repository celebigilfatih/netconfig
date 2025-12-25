import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { env } from "../../config/env.js";
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

export function registerJobRoutes(app: FastifyInstance): void {
  app.get(
    "/internal/jobs/pending",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const acquire = await client.query(
          `UPDATE backup_executions be
           SET status = 'running'
           WHERE be.id IN (
             SELECT DISTINCT ON (be2.device_id) be2.id
             FROM backup_executions be2
             WHERE be2.status = 'pending'
             ORDER BY be2.device_id, be2.started_at ASC
             LIMIT 25
             FOR UPDATE SKIP LOCKED
           )
           RETURNING be.id`
        );
        const ids: string[] = acquire.rows.map((r) => String(r.id));
        if (ids.length === 0) {
          await client.query("COMMIT");
          return reply.send({ items: [] });
        }
        const res = await client.query(
          `SELECT be.id as execution_id,
                  d.id as device_id,
                  d.tenant_id,
                  d.hostname,
                  d.mgmt_ip::text AS mgmt_ip,
                  d.ssh_port,
                  d.vendor,
                  dc.username,
                  dc.password_encrypted,
                  dc.password_iv,
                  dc.secret_encrypted,
                  dc.secret_iv
           FROM backup_executions be
           JOIN devices d ON d.id = be.device_id
           LEFT JOIN device_credentials dc ON dc.device_id = d.id
           WHERE be.id = ANY($1::uuid[])`,
          [ids]
        );
        await client.query("COMMIT");
        const items = res.rows.map((row) => {
          const password = row.password_encrypted && row.password_iv
            ? decryptSecret(row.password_encrypted, row.password_iv)
            : null;
          const secret = row.secret_encrypted && row.secret_iv
            ? decryptSecret(row.secret_encrypted, row.secret_iv)
            : null;
          return {
            executionId: row.execution_id,
            deviceId: row.device_id,
            tenantId: row.tenant_id,
            hostname: row.hostname,
            mgmtIp: row.mgmt_ip,
            sshPort: row.ssh_port,
            vendor: row.vendor,
            username: row.username,
            password,
            secret,
          };
        });
        return reply.send({ items });
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        return reply.send({ items: [] });
      } finally {
        client.release();
      }
    }
  );

  app.patch(
    "/internal/jobs/:executionId/status",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const paramsSchema = z.object({ executionId: z.string().uuid() });
      const bodySchema = z.object({ status: z.enum(["running", "skipped"]) });
      const { executionId } = paramsSchema.parse(request.params);
      const { status } = bodySchema.parse(request.body);
      await db.query(`UPDATE backup_executions SET status = $1 WHERE id = $2`, [status, executionId]);
      return reply.status(204).send();
    }
  );

  app.post(
    "/internal/jobs/cleanup_stale",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const bodySchema = z.object({ thresholdSeconds: z.coerce.number().int().positive().default(600) });
      const { thresholdSeconds } = bodySchema.parse((request as any).body ?? {});
      const client = await db.connect();
      try {
        await client.query(
          `UPDATE backup_executions
           SET status = 'failed', completed_at = now(), error_message = COALESCE(error_message, 'Stale execution auto-failed')
           WHERE status = 'running' AND started_at < now() - INTERVAL '1 second' * $1`,
          [thresholdSeconds]
        );
        await client.query(
          `UPDATE backup_executions
           SET status = 'failed', completed_at = now(), error_message = 'Pending execution auto-failed'
           WHERE status = 'pending' AND started_at < now() - INTERVAL '1 second' * $1`,
          [thresholdSeconds]
        );
        return reply.status(204).send();
      } finally {
        client.release();
      }
    }
  );
}
