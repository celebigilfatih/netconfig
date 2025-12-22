import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { decryptSecret } from "../../infra/security/aes.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snmp: any = require("net-snmp");

function createSession(host: string, community: string) {
  const options = { version: snmp.Version2c, timeout: 2000, retries: 1 };
  return snmp.createSession(host, community || "public", options);
}

function walkAsync(session: any, oid: string): Promise<Array<{ oid: string; value: any }>> {
  return new Promise((resolve, reject) => {
    const rows: Array<{ oid: string; value: any }> = [];
    session.walk(
      oid,
      20,
      (varbinds: any[]) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError && snmp.isVarbindError(vb)) continue;
          rows.push({ oid: String(vb.oid), value: vb.value });
        }
      },
      (err: any) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

async function getCommunity(deviceId: string): Promise<string> {
  const c = await db.query(
    `SELECT secret_encrypted, secret_iv FROM device_credentials WHERE device_id = $1 LIMIT 1`,
    [deviceId]
  );
  if (c.rowCount && c.rows[0]?.secret_encrypted && c.rows[0]?.secret_iv) {
    try { return decryptSecret(c.rows[0].secret_encrypted as Buffer, c.rows[0].secret_iv as Buffer); } catch {}
  }
  return "public";
}

async function ensureAlarmsTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS alarms (
       id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
       tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
       device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
       type text NOT NULL,
       severity text NOT NULL,
       message text NOT NULL,
       acknowledged boolean NOT NULL DEFAULT false,
       created_at timestamptz NOT NULL DEFAULT now(),
       resolved_at timestamptz,
       meta jsonb
     );
     CREATE INDEX IF NOT EXISTS idx_alarms_tenant_created ON alarms(tenant_id, created_at DESC);
     CREATE INDEX IF NOT EXISTS idx_alarms_device_created ON alarms(device_id, created_at DESC);
     CREATE INDEX IF NOT EXISTS idx_alarms_active ON alarms(tenant_id) WHERE acknowledged = false AND resolved_at IS NULL;
     CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_alarm ON alarms(tenant_id, device_id, type, message) WHERE acknowledged = false AND resolved_at IS NULL;`
  );
}

async function ensureUserPreferencesTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS user_preferences (
       id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
       user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
       alarm_severity_filter text DEFAULT 'all',
       alarm_type_filter text DEFAULT 'all',
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE (user_id)
     );
     CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);`
  );
}

async function upsertActiveAlarm(
  tenantId: string,
  deviceId: string,
  type: string,
  severity: string,
  message: string,
  meta?: any
): Promise<void> {
  const ex = await db.query(
    `SELECT id FROM alarms WHERE tenant_id = $1 AND device_id = $2 AND type = $3 AND message = $4 AND acknowledged = false AND resolved_at IS NULL LIMIT 1`,
    [tenantId, deviceId, type, message]
  );
  if (ex.rowCount) return;
  await db.query(
    `INSERT INTO alarms (tenant_id, device_id, type, severity, message, acknowledged, meta)
     VALUES ($1, $2, $3, $4, $5, false, $6)`,
    [tenantId, deviceId, type, severity, message, meta ? JSON.stringify(meta) : null]
  );
}

async function resolveActiveAlarmByType(
  tenantId: string,
  deviceId: string,
  type: string
): Promise<void> {
  await db.query(
    `UPDATE alarms SET resolved_at = now()
     WHERE tenant_id = $1 AND device_id = $2 AND type = $3 AND acknowledged = false AND resolved_at IS NULL`,
    [tenantId, deviceId, type]
  );
}

async function resolveMissingInterfaceDown(
  tenantId: string,
  deviceId: string,
  currentDownIndices: Set<number>
): Promise<void> {
  const res = await db.query(
    `SELECT id, meta FROM alarms WHERE tenant_id = $1 AND device_id = $2 AND type = 'interface_down' AND acknowledged = false AND resolved_at IS NULL`,
    [tenantId, deviceId]
  );
  for (const r of res.rows) {
    let idx: number | null = null;
    try {
      const m = r.meta as any;
      if (m && typeof m.index !== 'undefined') idx = Number(m.index);
    } catch {}
    if (idx !== null && !currentDownIndices.has(idx)) {
      await db.query(`UPDATE alarms SET resolved_at = now() WHERE id = $1`, [r.id]);
    }
  }
}

export function registerAlarmRoutes(app: FastifyInstance): void {
  
  app.get(
    "/alarms",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const querySchema = z.object({ status: z.string().default("active"), limit: z.coerce.number().int().positive().max(1000).default(100), offset: z.coerce.number().int().nonnegative().default(0) });
      const tenantId = (request.user as any)?.tenantId as string;
      const q = querySchema.safeParse(request.query);
      const status = q.success ? q.data.status : "active";
      const limit = q.success ? q.data.limit : 100;
      const offset = q.success ? q.data.offset : 0;

      await ensureAlarmsTable();

      let where = `tenant_id = $1`;
      const params: any[] = [tenantId];
      if (status === 'active') {
        where += ` AND acknowledged = false AND resolved_at IS NULL`;
      } else if (status === 'acknowledged') {
        where += ` AND acknowledged = true`;
      }
      const res = await db.query(
        `SELECT id, device_id, type, severity, message, acknowledged, created_at, resolved_at, meta
         FROM alarms
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset]
      );
      return reply.send({ items: res.rows });
    }
  );

  app.post(
    "/alarms/:id/ack",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      await ensureAlarmsTable();
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const tenantId = (request.user as any)?.tenantId as string;
      const res = await db.query(
        `UPDATE alarms SET acknowledged = true WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (res.rowCount === 0) return reply.status(404).send({ message: "Alarm not found" });
      return reply.status(204).send();
    }
  );

  app.get(
    "/alarms/preferences",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      await ensureUserPreferencesTable();
      const userId = (request.user as any)?.sub as string;
      const tenantId = (request.user as any)?.tenantId as string;
      if (!userId || !tenantId) return reply.status(401).send({ message: "Unauthorized" });
      const res = await db.query(
        `SELECT alarm_severity_filter, alarm_type_filter FROM user_preferences WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      if (res.rowCount === 0) {
        await db.query(
          `INSERT INTO user_preferences (user_id, tenant_id, alarm_severity_filter, alarm_type_filter)
           VALUES ($1, $2, 'all', 'all') ON CONFLICT (user_id) DO NOTHING`,
          [userId, tenantId]
        );
        return reply.send({ alarmSeverity: "all", alarmType: "all" });
      }
      const row = res.rows[0] as any;
      return reply.send({ alarmSeverity: String(row.alarm_severity_filter || "all"), alarmType: String(row.alarm_type_filter || "all") });
    }
  );

  const prefSchema = z.object({
    alarmSeverity: z.enum(["all", "warning", "critical"]).default("all"),
    alarmType: z.string().min(1).max(128).default("all"),
  });

  app.put(
    "/alarms/preferences",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      await ensureUserPreferencesTable();
      const body = prefSchema.parse(request.body);
      const userId = (request.user as any)?.sub as string;
      const tenantId = (request.user as any)?.tenantId as string;
      await db.query(
        `INSERT INTO user_preferences (user_id, tenant_id, alarm_severity_filter, alarm_type_filter)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET alarm_severity_filter = EXCLUDED.alarm_severity_filter, alarm_type_filter = EXCLUDED.alarm_type_filter, updated_at = now()`,
        [userId, tenantId, body.alarmSeverity, body.alarmType]
      );
      return reply.status(204).send();
    }
  );
}

export async function performAlarmScan(): Promise<void> {
  await ensureAlarmsTable();
  const tenants = await db.query(`SELECT id FROM tenants`);
  for (const t of tenants.rows) {
    const tenantId = t.id as string;
    const devs = await db.query(
      `SELECT id, mgmt_ip FROM devices WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
      [tenantId]
    );
    for (const d of devs.rows) {
      const deviceId = d.id as string;
      const host = String(d.mgmt_ip);
      const community = await getCommunity(deviceId);
      let session: any | null = null;
      try {
        session = createSession(host, community);
        const ifAdminOid = "1.3.6.1.2.1.2.2.1.7";
        const ifOperOid = "1.3.6.1.2.1.2.2.1.8";
        const ifNameOid = "1.3.6.1.2.1.31.1.1.1.1";
        const adminRows = await walkAsync(session, ifAdminOid);
        const operRows = await walkAsync(session, ifOperOid);
        const nameRows = await walkAsync(session, ifNameOid);
        const nameMap = new Map<number, string>();
        for (const r of nameRows) {
          const idx = Number(r.oid.split(".").pop());
          if (!Number.isFinite(idx)) continue;
          const s = String(r.value || "").trim();
          if (s) nameMap.set(idx, s);
        }
        const opMap = new Map<number, number>();
        for (const r of operRows) {
          const idx = Number(r.oid.split(".").pop());
          if (!Number.isFinite(idx)) continue;
          const v = Number(r.value);
          opMap.set(idx, v);
        }
        const currentDown = new Set<number>();
        for (const r of adminRows) {
          const idx = Number(r.oid.split(".").pop());
          if (!Number.isFinite(idx)) continue;
          const a = Number(r.value);
          const o = opMap.get(idx);
          if (a === 1 && o === 2) {
            currentDown.add(idx);
            const name = nameMap.get(idx) || String(idx);
            await upsertActiveAlarm(tenantId, deviceId, "interface_down", "warning", `Interface down: ${name}`, { index: idx, name });
          }
        }
        await resolveMissingInterfaceDown(tenantId, deviceId, currentDown);
        const lastMetrics = await db.query(
          `SELECT cpu_percent, mem_used_percent FROM device_metrics WHERE tenant_id = $1 AND device_id = $2 ORDER BY ts DESC LIMIT 3`,
          [tenantId, deviceId]
        );
        if (lastMetrics.rowCount) {
          const rows = lastMetrics.rows as Array<{ cpu_percent: number | null; mem_used_percent: number | null }>;
          const cpuVals = rows.map(r => (typeof r.cpu_percent === 'number' ? r.cpu_percent : null)).filter(v => v !== null) as number[];
          const memVals = rows.map(r => (typeof r.mem_used_percent === 'number' ? r.mem_used_percent : null)).filter(v => v !== null) as number[];
          const highCpu = cpuVals.slice(0, 2).filter(v => v >= 80).length >= 2 || cpuVals.filter(v => v >= 85).length >= 2;
          const lowCpu = cpuVals.slice(0, 2).filter(v => v < 70).length >= 2;
          const highMem = memVals.slice(0, 2).filter(v => v >= 80).length >= 2 || memVals.filter(v => v >= 85).length >= 2;
          const lowMem = memVals.slice(0, 2).filter(v => v < 70).length >= 2;
          if (highCpu) {
            const cpu = cpuVals[0] ?? null;
            await upsertActiveAlarm(tenantId, deviceId, "resource_cpu_high", "warning", `CPU high: ${cpu ?? '-'}%`);
          } else if (lowCpu) {
            await resolveActiveAlarmByType(tenantId, deviceId, "resource_cpu_high");
          }
          if (highMem) {
            const mem = memVals[0] ?? null;
            await upsertActiveAlarm(tenantId, deviceId, "resource_memory_high", "warning", `Memory high: ${mem ?? '-'}%`);
          } else if (lowMem) {
            await resolveActiveAlarmByType(tenantId, deviceId, "resource_memory_high");
          }
        }
        await resolveActiveAlarmByType(tenantId, deviceId, "device_unreachable");
      } catch {
        await upsertActiveAlarm(tenantId, deviceId, "device_unreachable", "critical", "Device unreachable");
      } finally {
        try { session?.close(); } catch {}
      }
    }
  }
}
