import { FastifyInstance } from "fastify";
import { db } from "../../infra/db/client.js";

export function registerStatsRoutes(app: FastifyInstance): void {
  app.get(
    "/stats/overview",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const dTotal = await client.query(
          `SELECT COUNT(*)::int AS c FROM devices WHERE tenant_id = $1`,
          [tenantId]
        );
        const dActive = await client.query(
          `SELECT COUNT(*)::int AS c FROM devices WHERE tenant_id = $1 AND is_active = true`,
          [tenantId]
        );
        const vCounts = await client.query(
          `SELECT vendor, COUNT(*)::int AS c FROM devices WHERE tenant_id = $1 GROUP BY vendor`,
          [tenantId]
        );
        const b24 = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
             COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '24 hours'`,
          [tenantId]
        );
        const lastBackup = await client.query(
          `SELECT MAX(backup_timestamp) AS ts FROM device_backups WHERE tenant_id = $1`,
          [tenantId]
        );
        const pendingExec = await client.query(
          `SELECT COUNT(*)::int AS c
           FROM backup_executions be
           JOIN devices d ON d.id = be.device_id
           WHERE d.tenant_id = $1 AND be.status = 'pending'`,
          [tenantId]
        );

        const vendors: Record<string, number> = { fortigate: 0, cisco_ios: 0, mikrotik: 0 };
        for (const row of vCounts.rows) vendors[row.vendor as string] = row.c as number;

        return reply.send({
          devices: { total: dTotal.rows[0].c as number, active: dActive.rows[0].c as number },
          vendors,
          backups24h: { success: b24.rows[0].success as number, failed: b24.rows[0].failed as number },
          lastBackupTs: lastBackup.rows[0].ts as string | null,
          pendingExecutions: pendingExec.rows[0].c as number,
        });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/stats/backup_counts_by_device_24h",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT device_id, 
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '24 hours'
           GROUP BY device_id`,
          [tenantId]
        );
        return reply.send({ items: res.rows.map(r => ({ deviceId: r.device_id as string, success: r.success as number, failed: r.failed as number })) });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/stats/backup_counts_by_device_7d",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT device_id, 
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '7 days'
           GROUP BY device_id`,
          [tenantId]
        );
        return reply.send({ items: res.rows.map(r => ({ deviceId: r.device_id as string, success: r.success as number, failed: r.failed as number })) });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/stats/backup_counts_by_device_30d",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const res = await client.query(
          `SELECT device_id, 
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '30 days'
           GROUP BY device_id`,
          [tenantId]
        );
        return reply.send({ items: res.rows.map(r => ({ deviceId: r.device_id as string, success: r.success as number, failed: r.failed as number })) });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/stats/backup_overview_by_device",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const client = await db.connect();
      try {
        const devices = await client.query(
          `SELECT id, name, vendor FROM devices WHERE tenant_id = $1 ORDER BY name`,
          [tenantId]
        );
        const lastRows = await client.query(
          `SELECT DISTINCT ON (device_id) device_id, backup_timestamp, is_success, error_message
           FROM device_backups
           WHERE tenant_id = $1
           ORDER BY device_id, backup_timestamp DESC`,
          [tenantId]
        );
        const c24 = await client.query(
          `SELECT device_id,
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '24 hours'
           GROUP BY device_id`,
          [tenantId]
        );
        const c7 = await client.query(
          `SELECT device_id,
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '7 days'
           GROUP BY device_id`,
          [tenantId]
        );
        const c30 = await client.query(
          `SELECT device_id,
                  COALESCE(SUM(CASE WHEN is_success THEN 1 ELSE 0 END), 0)::int AS success,
                  COALESCE(SUM(CASE WHEN NOT is_success THEN 1 ELSE 0 END), 0)::int AS failed
           FROM device_backups
           WHERE tenant_id = $1 AND backup_timestamp >= now() - interval '30 days'
           GROUP BY device_id`,
          [tenantId]
        );

        const lastMap = new Map<string, { ts: string; ok: boolean; err: string | null }>();
        for (const r of lastRows.rows) {
          lastMap.set(r.device_id as string, { ts: String(r.backup_timestamp), ok: !!r.is_success, err: (r.error_message as string) ?? null });
        }
        const mapFrom = (rows: any[]) => {
          const m = new Map<string, { success: number; failed: number }>();
          for (const r of rows) m.set(r.device_id as string, { success: r.success as number, failed: r.failed as number });
          return m;
        };
        const m24 = mapFrom(c24.rows);
        const m7 = mapFrom(c7.rows);
        const m30 = mapFrom(c30.rows);

        const items = devices.rows.map((d) => {
          const id = d.id as string;
          const l = lastMap.get(id);
          const c24 = m24.get(id) || { success: 0, failed: 0 };
          const c7 = m7.get(id) || { success: 0, failed: 0 };
          const c30 = m30.get(id) || { success: 0, failed: 0 };
          return {
            deviceId: id,
            name: d.name as string,
            vendor: d.vendor as string,
            lastTs: l ? l.ts : null,
            lastSuccess: l ? l.ok : null,
            lastError: l ? l.err : null,
            counts24h: c24,
            counts7d: c7,
            counts30d: c30,
          };
        });
        return reply.send({ items });
      } finally {
        client.release();
      }
    }
  );
}
