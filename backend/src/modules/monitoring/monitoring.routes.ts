import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { decryptSecret } from "../../infra/security/aes.js";
import { env } from "../../config/env.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const snmp: any = require("net-snmp");

type DeviceRow = { id: string; tenant_id: string; mgmt_ip: string; vendor: string };

function mapLevel(level: string | null | undefined) {
  const v = String(level || "noAuthNoPriv");
  if (v === "authPriv") return snmp.SecurityLevel.authPriv;
  if (v === "authNoPriv") return snmp.SecurityLevel.authNoPriv;
  return snmp.SecurityLevel.noAuthNoPriv;
}
function mapAuth(auth: string | null | undefined) {
  const v = String(auth || "sha").toLowerCase();
  if (v === "md5") return snmp.AuthProtocols.md5;
  return snmp.AuthProtocols.sha;
}
function mapPriv(priv: string | null | undefined) {
  const v = String(priv || "aes").toLowerCase();
  if (v === "des") return snmp.PrivProtocols.des;
  return snmp.PrivProtocols.aes;
}
function createDeviceSession(cfg: { host: string; community?: string; v3?: { username: string; level: string; authProtocol?: string; authKey?: string; privProtocol?: string; privKey?: string } }) {
  if (cfg.v3 && cfg.v3.username) {
    const options = { version: snmp.Version3, timeout: 2000, retries: 1 };
    const user = {
      name: cfg.v3.username,
      level: mapLevel(cfg.v3.level),
      authProtocol: mapAuth(cfg.v3.authProtocol),
      authKey: cfg.v3.authKey,
      privProtocol: mapPriv(cfg.v3.privProtocol),
      privKey: cfg.v3.privKey,
    };
    return snmp.createV3Session(cfg.host, user, options);
  }
  const options = { version: snmp.Version2c, timeout: 2000, retries: 1 };
  return snmp.createSession(cfg.host, cfg.community || "public", options);
}

function getAsync(session: any, oids: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    session.get(oids, (err: any, varbinds: any[]) => {
      if (err) return reject(err);
      resolve(varbinds);
    });
  });
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

async function ensureSnmpV3Columns(): Promise<void> {
  await db.query(
    `ALTER TABLE device_credentials
       ADD COLUMN IF NOT EXISTS snmp_version text NOT NULL DEFAULT 'v2c',
       ADD COLUMN IF NOT EXISTS snmp_v3_username varchar(255),
       ADD COLUMN IF NOT EXISTS snmp_v3_level text,
       ADD COLUMN IF NOT EXISTS snmp_v3_auth_protocol text,
       ADD COLUMN IF NOT EXISTS snmp_v3_auth_key_encrypted bytea,
       ADD COLUMN IF NOT EXISTS snmp_v3_auth_key_iv bytea,
       ADD COLUMN IF NOT EXISTS snmp_v3_priv_protocol text,
       ADD COLUMN IF NOT EXISTS snmp_v3_priv_key_encrypted bytea,
       ADD COLUMN IF NOT EXISTS snmp_v3_priv_key_iv bytea`
  );
}
async function loadSnmpForDevice(deviceId: string, tenantId: string): Promise<{ host: string; community?: string; vendor: string; v3?: { username: string; level: string; authProtocol?: string; authKey?: string; privProtocol?: string; privKey?: string } } | null> {
  const client = await db.connect();
  try {
    const d = await client.query(
      `SELECT id, tenant_id, mgmt_ip, vendor FROM devices WHERE id = $1 AND tenant_id = $2`,
      [deviceId, tenantId]
    );
    if (d.rowCount === 0) return null;
    const dev = d.rows[0] as DeviceRow;
    await ensureSnmpV3Columns();
    const c = await client.query(
      `SELECT snmp_version, secret_encrypted, secret_iv,
              snmp_v3_username, snmp_v3_level, snmp_v3_auth_protocol,
              snmp_v3_auth_key_encrypted, snmp_v3_auth_key_iv,
              snmp_v3_priv_protocol, snmp_v3_priv_key_encrypted, snmp_v3_priv_key_iv
       FROM device_credentials WHERE device_id = $1 LIMIT 1`,
      [deviceId]
    );
    if (c.rowCount) {
      const row = c.rows[0] as any;
      const ver = String(row.snmp_version || 'v2c');
      if (ver === 'v3' && row.snmp_v3_username) {
        let authKey: string | undefined = undefined;
        let privKey: string | undefined = undefined;
        try {
          if (row.snmp_v3_auth_key_encrypted && row.snmp_v3_auth_key_iv) {
            authKey = decryptSecret(row.snmp_v3_auth_key_encrypted as Buffer, row.snmp_v3_auth_key_iv as Buffer);
          }
        } catch {}
        try {
          if (row.snmp_v3_priv_key_encrypted && row.snmp_v3_priv_key_iv) {
            privKey = decryptSecret(row.snmp_v3_priv_key_encrypted as Buffer, row.snmp_v3_priv_key_iv as Buffer);
          }
        } catch {}
        return {
          host: dev.mgmt_ip as unknown as string,
          vendor: dev.vendor as string,
          v3: {
            username: String(row.snmp_v3_username),
            level: String(row.snmp_v3_level || 'authPriv'),
            authProtocol: row.snmp_v3_auth_protocol ? String(row.snmp_v3_auth_protocol) : undefined,
            authKey,
            privProtocol: row.snmp_v3_priv_protocol ? String(row.snmp_v3_priv_protocol) : undefined,
            privKey,
          },
        };
      }
    }
    let community = "public";
    if (c.rowCount && c.rows[0]?.secret_encrypted && c.rows[0]?.secret_iv) {
      try {
        community = decryptSecret(c.rows[0].secret_encrypted as Buffer, c.rows[0].secret_iv as Buffer);
      } catch {}
    }
    return { host: dev.mgmt_ip as unknown as string, community, vendor: dev.vendor as string };
  } finally {
    client.release();
  }
}

export function registerMonitoringRoutes(app: FastifyInstance): void {
  function requireAutomationAuth() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const auth = request.headers.authorization;
      const rawToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
      if (env.AUTOMATION_SERVICE_TOKEN && rawToken === env.AUTOMATION_SERVICE_TOKEN) {
        return;
      }
      try {
        await (request as any).jwtVerify();
      } catch {
        return reply.status(401).send({ message: "Unauthorized" });
      }
    };
  }
  async function ensureMetricsTable() {
    await db.query(
      `CREATE TABLE IF NOT EXISTS device_metrics (
         id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
         tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
         device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
         ts timestamptz NOT NULL DEFAULT now(),
         uptime_ticks integer,
         cpu_percent integer,
         mem_used_percent integer
       );
       CREATE INDEX IF NOT EXISTS idx_device_metrics_device_ts ON device_metrics (device_id, ts DESC);`
    );
  }
  async function ensureInventoryTable() {
    await db.query(
      `CREATE TABLE IF NOT EXISTS device_inventory (
         id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
         tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
         device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
         ts timestamptz NOT NULL DEFAULT now(),
         model text,
         firmware text,
         serial text
       );
       CREATE INDEX IF NOT EXISTS idx_device_inventory_device_ts ON device_inventory (device_id, ts DESC);`
    );
  }
  async function getMetricsSchema(): Promise<{ kind: "legacy" | "new" }> {
    const res = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'device_metrics'`
    );
    const cols = res.rows.map((r: any) => String(r.column_name));
    if (cols.includes("cpu_usage") || cols.includes("mem_usage") || cols.includes("uptime_seconds")) {
      return { kind: "legacy" };
    }
    return { kind: "new" };
  }
  app.get(
    "/monitoring/devices/:id/status",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.status(400).send({ message: "Invalid device id" });
      const deviceId = p.data.id;
      const tenantId = (request.user as any)?.tenantId as string;
      const q = (request.query as any) || {};
      const persist = String(q.persist || "true").toLowerCase() === "true";
      const dc = await loadSnmpForDevice(deviceId, tenantId);
      if (!dc) return reply.status(404).send({ message: "Device not found" });

      const session = createDeviceSession(dc);
      try {
        const uptimeOid = "1.3.6.1.2.1.1.3.0";
        const cpuTableOid = "1.3.6.1.2.1.25.3.3.1.2";
        const memTotalOid = "1.3.6.1.4.1.2021.4.5.0";
        const memAvailOid = "1.3.6.1.4.1.2021.4.6.0";

        let uptimeTicks: number | null = null;
        try {
          const up = await getAsync(session, [uptimeOid]);
          const v = up[0]?.value;
          uptimeTicks = typeof v === "number" ? v : null;
        } catch {}

        let cpuPercent: number | null = null;
        try {
          const rows = await walkAsync(session, cpuTableOid);
          const vals = rows.map((r) => (typeof r.value === "number" ? r.value : null)).filter((v) => v !== null) as number[];
          if (vals.length) cpuPercent = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        } catch {}

        let memUsedPercent: number | null = null;
        try {
          const [tot] = await getAsync(session, [memTotalOid]);
          const [av] = await getAsync(session, [memAvailOid]);
          const total = typeof tot?.value === "number" ? tot.value : null;
          const avail = typeof av?.value === "number" ? av.value : null;
          if (total && avail && total > 0) {
            const used = total - avail;
            memUsedPercent = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
          }
        } catch {}

        if (persist && (uptimeTicks !== null || cpuPercent !== null || memUsedPercent !== null)) {
          await ensureMetricsTable();
          const schema = await getMetricsSchema();
          if (schema.kind === "legacy") {
            const uptimeSecs = typeof uptimeTicks === "number" ? Math.floor(uptimeTicks / 100) : null;
            await db.query(
              `INSERT INTO device_metrics (tenant_id, device_id, ts, cpu_usage, mem_usage, uptime_seconds, meta)
               VALUES ($1, $2, now(), $3, $4, $5, NULL)`,
               [tenantId, deviceId, cpuPercent, memUsedPercent, uptimeSecs]
            );
          } else {
            await db.query(
              `INSERT INTO device_metrics (tenant_id, device_id, uptime_ticks, cpu_percent, mem_used_percent)
               VALUES ($1, $2, $3, $4, $5)`,
              [tenantId, deviceId, uptimeTicks, cpuPercent, memUsedPercent]
            );
          }
        }
        return reply.send({ uptimeTicks, cpuPercent, memUsedPercent });
      } catch (err) {
        return reply.status(502).send({ message: "SNMP query failed", error: String(err) });
      } finally {
        try { session.close(); } catch {}
      }
    }
  );

  app.get(
    "/internal/monitoring/devices",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const querySchema = z.object({
        limit: z.coerce
          .number()
          .int()
          .positive()
          .transform((n) => (n > 200 ? 200 : n))
          .default(50),
        offset: z.coerce.number().int().nonnegative().default(0),
      });
      const q = querySchema.parse(request.query);
      const res = await db.query(
        `SELECT id, tenant_id, hostname, mgmt_ip, vendor
         FROM devices
         WHERE is_active = true
         ORDER BY name
         LIMIT $1 OFFSET $2`,
        [q.limit, q.offset]
      );
      return reply.send({ items: res.rows });
    }
  );

  app.get(
    "/internal/monitoring/devices/:id/snmp_config",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const d = await db.query(`SELECT tenant_id FROM devices WHERE id = $1`, [id]);
      if (d.rowCount === 0) return reply.status(404).send({ message: "Device not found" });
      const tenantId = d.rows[0].tenant_id as string;
      const cfg = await loadSnmpForDevice(id, tenantId);
      if (!cfg) return reply.status(404).send({ message: "SNMP config not found" });
      return reply.send(cfg);
    }
  );

  app.post(
    "/internal/monitoring/metrics",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const bodySchema = z.object({
        tenantId: z.string().uuid(),
        deviceId: z.string().uuid(),
        uptimeTicks: z.number().int().optional().nullable(),
        cpuPercent: z.number().int().min(0).max(100).optional().nullable(),
        memUsedPercent: z.number().int().min(0).max(100).optional().nullable(),
      });
      const body = bodySchema.parse(request.body);
      await ensureMetricsTable();
      const schema = await getMetricsSchema();
      if (schema.kind === "legacy") {
        const uptimeSecs = typeof body.uptimeTicks === "number" ? Math.floor(body.uptimeTicks / 100) : null;
        await db.query(
          `INSERT INTO device_metrics (tenant_id, device_id, ts, cpu_usage, mem_usage, uptime_seconds, meta)
           VALUES ($1, $2, now(), $3, $4, $5, NULL)`,
          [body.tenantId, body.deviceId, body.cpuPercent ?? null, body.memUsedPercent ?? null, uptimeSecs]
        );
      } else {
        await db.query(
          `INSERT INTO device_metrics (tenant_id, device_id, uptime_ticks, cpu_percent, mem_used_percent)
           VALUES ($1, $2, $3, $4, $5)`,
          [body.tenantId, body.deviceId, body.uptimeTicks ?? null, body.cpuPercent ?? null, body.memUsedPercent ?? null]
        );
      }
      return reply.status(201).send();
    }
  );

  app.post(
    "/internal/monitoring/inventory",
    { preValidation: requireAutomationAuth() },
    async (request, reply) => {
      const bodySchema = z.object({
        tenantId: z.string().uuid(),
        deviceId: z.string().uuid(),
        model: z.string().optional().nullable(),
        firmware: z.string().optional().nullable(),
        serial: z.string().optional().nullable(),
      });
      const body = bodySchema.parse(request.body);
      await ensureInventoryTable();
      await db.query(
        `INSERT INTO device_inventory (tenant_id, device_id, model, firmware, serial)
         VALUES ($1, $2, $3, $4, $5)`,
        [body.tenantId, body.deviceId, body.model ?? null, body.firmware ?? null, body.serial ?? null]
      );
      return reply.status(201).send();
    }
  );

  app.get(
    "/monitoring/devices/:id/interfaces",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.status(400).send({ message: "Invalid device id" });
      const deviceId = p.data.id;
      const tenantId = (request.user as any)?.tenantId as string;
      const dc = await loadSnmpForDevice(deviceId, tenantId);
      if (!dc) return reply.status(404).send({ message: "Device not found" });

      const session = createDeviceSession(dc);
      try {
        const ifIndexOid = "1.3.6.1.2.1.2.2.1.1";
        const ifDescrOid = "1.3.6.1.2.1.2.2.1.2";
        const ifNameOid = "1.3.6.1.2.1.31.1.1.1.1";
        const ifAdminOid = "1.3.6.1.2.1.2.2.1.7";
        const ifOperOid = "1.3.6.1.2.1.2.2.1.8";

        const idxRows = await walkAsync(session, ifIndexOid);
        const nameRows = await walkAsync(session, ifNameOid);
        const descrRows = await walkAsync(session, ifDescrOid);
        const adminRows = await walkAsync(session, ifAdminOid);
        const operRows = await walkAsync(session, ifOperOid);

        const byIdx = new Map<number, { index: number; name?: string; descr?: string; admin?: number; oper?: number }>();
        for (const r of idxRows) {
          const idx = Number(r.oid.split(".").pop());
          if (!Number.isFinite(idx)) continue;
          byIdx.set(idx, { index: idx });
        }
        const assign = (rows: Array<{ oid: string; value: any }>, key: "name" | "descr" | "admin" | "oper") => {
          for (const r of rows) {
            const idx = Number(r.oid.split(".").pop());
            if (!Number.isFinite(idx)) continue;
            const cur = byIdx.get(idx) || { index: idx };
            const val = key === "name" || key === "descr" ? String(r.value) : Number(r.value);
            (cur as any)[key] = val;
            byIdx.set(idx, cur);
          }
        };
        assign(nameRows, "name");
        assign(descrRows, "descr");
        assign(adminRows, "admin");
        assign(operRows, "oper");

        const items = Array.from(byIdx.values()).map((x) => ({
          index: x.index,
          name: (x.name && x.name.trim()) ? x.name : (x.descr ?? ""),
          adminStatus: x.admin ?? null,
          operStatus: x.oper ?? null,
        }));
        return reply.send({ items });
      } catch (err) {
        return reply.status(502).send({ message: "SNMP query failed", error: String(err) });
      } finally {
        try { session.close(); } catch {}
      }
    }
  );

  app.get(
    "/monitoring/devices/:id/inventory",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.status(400).send({ message: "Invalid device id" });
      const deviceId = p.data.id;
      const tenantId = (request.user as any)?.tenantId as string;
      const dc = await loadSnmpForDevice(deviceId, tenantId);
      if (!dc) return reply.status(404).send({ message: "Device not found" });

      const session = createDeviceSession(dc);
      try {
        const sysDescrOid = "1.3.6.1.2.1.1.1.0";
        const modelOid = "1.3.6.1.2.1.47.1.1.1.1.13";
        const serialOid = "1.3.6.1.2.1.47.1.1.1.1.11";
        const fwOidForti = "1.3.6.1.4.1.12356.101.4.1.1.0";
        const serialForti = "1.3.6.1.4.1.12356.101.4.1.3.0";
        const fwOidMikro = "1.3.6.1.4.1.14988.1.1.4.3.0";
        const serialMikro = "1.3.6.1.4.1.14988.1.1.7.3.0";

        let model: string | null = null;
        let firmware: string | null = null;
        let serial: string | null = null;

        try {
          const modelRows = await walkAsync(session, modelOid);
          for (const r of modelRows) { const s = String(r.value).trim(); if (s) { model = s; break; } }
        } catch {}

        try {
          const serialRows = await walkAsync(session, serialOid);
          for (const r of serialRows) { const s = String(r.value).trim(); if (s) { serial = s; break; } }
        } catch {}

        try {
          const sys = await getAsync(session, [sysDescrOid]);
          const s = String(sys[0]?.value || "").trim();
          if (s && !firmware) firmware = s;
        } catch {}

        try {
          if (dc.vendor === "fortigate") {
            const vbs = await getAsync(session, [fwOidForti, serialForti]);
            const fv = String(vbs[0]?.value || "").trim(); if (fv) firmware = fv;
            const sv = String(vbs[1]?.value || "").trim(); if (sv) serial = sv;
          } else if (dc.vendor === "mikrotik") {
            const vbs = await getAsync(session, [fwOidMikro, serialMikro]);
            const fv = String(vbs[0]?.value || "").trim(); if (fv) firmware = fv;
            const sv = String(vbs[1]?.value || "").trim(); if (sv) serial = sv;
          }
        } catch {}

        return reply.send({ model, firmware, serial });
      } catch (err) {
        return reply.status(502).send({ message: "SNMP query failed", error: String(err) });
      } finally {
        try { session.close(); } catch {}
      }
    }
  );
  app.get(
    "/monitoring/overview",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      await ensureMetricsTable();
      const schema = await getMetricsSchema();
      const client = await db.connect();
      try {
        const devices = await client.query(
          `SELECT id, name, vendor, is_active FROM devices WHERE tenant_id = $1 ORDER BY name`,
          [tenantId]
        );
        const liveStatus = await client.query(
          `SELECT device_id, interfaces_summary FROM device_live_status WHERE device_id = ANY($1)`,
          [devices.rows.map((d) => d.id)]
        ).catch(() => ({ rows: [] })); // table might not exist yet
        const liveMap = new Map<string, string>();
        for (const r of liveStatus.rows) {
          liveMap.set(r.device_id, r.interfaces_summary);
        }

        const last = schema.kind === "legacy"
          ? await client.query(
              `SELECT DISTINCT ON (device_id) device_id, ts, uptime_seconds, cpu_usage, mem_usage
               FROM device_metrics
               WHERE tenant_id = $1
               ORDER BY device_id, ts DESC`,
              [tenantId]
            )
          : await client.query(
              `SELECT DISTINCT ON (device_id) device_id, ts, uptime_ticks, cpu_percent, mem_used_percent
               FROM device_metrics
               WHERE tenant_id = $1
               ORDER BY device_id, ts DESC`,
              [tenantId]
            );
        const byDev = new Map<string, { ts: string; uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null }>();
        if (schema.kind === "legacy") {
          for (const r of last.rows) {
            byDev.set(r.device_id as string, {
              ts: String(r.ts),
              uptimeTicks: (typeof r.uptime_seconds === "number" ? Math.floor(Number(r.uptime_seconds) * 100) : null),
              cpuPercent: (r.cpu_usage as number) ?? null,
              memUsedPercent: (r.mem_usage as number) ?? null,
            });
          }
        } else {
          for (const r of last.rows) {
            byDev.set(r.device_id as string, {
              ts: String(r.ts),
              uptimeTicks: (r.uptime_ticks as number) ?? null,
              cpuPercent: (r.cpu_percent as number) ?? null,
              memUsedPercent: (r.mem_used_percent as number) ?? null,
            });
          }
        }
        const items = devices.rows.map((d) => {
          const m = byDev.get(d.id as string);
          return {
            id: d.id as string,
            name: d.name as string,
            vendor: d.vendor as string,
            isActive: !!d.is_active,
            lastTs: m ? m.ts : null,
            uptimeTicks: m ? m.uptimeTicks : null,
            cpuPercent: m ? m.cpuPercent : null,
            memUsedPercent: m ? m.memUsedPercent : null,
            interfacesSummary: liveMap.get(d.id as string) || null,
          };
        });
        return reply.send({ items });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/monitoring/metrics/aggregated",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const tenantId = (request.user as any)?.tenantId as string;
      const querySchema = z.object({
        range: z.string().default("24h"),
        points: z.coerce.number().int().positive().max(1000).default(50),
        top: z.coerce.number().int().positive().max(100).default(5),
      });
      const q = querySchema.safeParse(request.query);
      const range = q.success ? q.data.range : "24h";
      const points = q.success ? q.data.points : 50;
      const top = q.success ? q.data.top : 5;
      await ensureMetricsTable();
      const schema = await getMetricsSchema();
      const client = await db.connect();
      try {
        const devRes = await client.query(
          `SELECT id, is_active FROM devices WHERE tenant_id = $1 ORDER BY name`,
          [tenantId]
        );
        const deviceCount = devRes.rowCount;
        const activeDeviceCount = devRes.rows.filter((r) => !!r.is_active).length;

        let lastRows: any[] = [];
        if (schema.kind === "legacy") {
          const r = await client.query(
            `SELECT DISTINCT ON (device_id) device_id, ts, cpu_usage, mem_usage, uptime_seconds
             FROM device_metrics
             WHERE tenant_id = $1
             ORDER BY device_id, ts DESC`,
            [tenantId]
          );
          lastRows = r.rows.map((x) => ({
            device_id: String(x.device_id),
            ts: String(x.ts),
            cpu: (x.cpu_usage as number) ?? null,
            mem: (x.mem_usage as number) ?? null,
            uptimeTicks: (typeof x.uptime_seconds === "number" ? Math.floor(Number(x.uptime_seconds) * 100) : null),
          }));
        } else {
          const r = await client.query(
            `SELECT DISTINCT ON (device_id) device_id, ts, cpu_percent, mem_used_percent, uptime_ticks
             FROM device_metrics
             WHERE tenant_id = $1
             ORDER BY device_id, ts DESC`,
            [tenantId]
          );
          lastRows = r.rows.map((x) => ({
            device_id: String(x.device_id),
            ts: String(x.ts),
            cpu: (x.cpu_percent as number) ?? null,
            mem: (x.mem_used_percent as number) ?? null,
            uptimeTicks: (x.uptime_ticks as number) ?? null,
          }));
        }

        const metricsDeviceCount = lastRows.length;
        const cpuVals = lastRows.map((r) => (typeof r.cpu === "number" ? r.cpu : null)).filter((v) => v !== null) as number[];
        const memVals = lastRows.map((r) => (typeof r.mem === "number" ? r.mem : null)).filter((v) => v !== null) as number[];
        const upVals = lastRows.map((r) => (typeof r.uptimeTicks === "number" ? r.uptimeTicks : null)).filter((v) => v !== null) as number[];
        const avgCpuPercent = cpuVals.length ? Math.round(cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length) : null;
        const avgMemUsedPercent = memVals.length ? Math.round(memVals.reduce((a, b) => a + b, 0) / memVals.length) : null;
        const avgUptimeHours = upVals.length ? Math.round((upVals.reduce((a, b) => a + b, 0) / upVals.length) / (100 * 3600)) : null;

        const topCpu = lastRows
          .filter((r) => typeof r.cpu === "number")
          .sort((a, b) => (b.cpu as number) - (a.cpu as number))
          .slice(0, top)
          .map((r) => ({ deviceId: r.device_id, ts: r.ts, cpuPercent: r.cpu as number }));

        const topMem = lastRows
          .filter((r) => typeof r.mem === "number")
          .sort((a, b) => (b.mem as number) - (a.mem as number))
          .slice(0, top)
          .map((r) => ({ deviceId: r.device_id, ts: r.ts, memUsedPercent: r.mem as number }));

        let trendRows: Array<{ ts: string; avgCpuPercent: number | null; avgMemUsedPercent: number | null }> = [];
        if (schema.kind === "legacy") {
          const tr = await client.query(
            `WITH buckets AS (
               SELECT generate_series(now() - $2::interval, now(), ($2::interval) / $3::int) AS bucket_start
             )
             SELECT bucket_start AS ts,
                    AVG(dm.cpu_usage) AS avg_cpu,
                    AVG(dm.mem_usage) AS avg_mem
             FROM buckets b
             LEFT JOIN device_metrics dm
               ON dm.tenant_id = $1
              AND dm.ts >= b.bucket_start
              AND dm.ts < b.bucket_start + (($2::interval) / $3::int)
             GROUP BY bucket_start
             ORDER BY bucket_start ASC`,
            [tenantId, range, points]
          );
          trendRows = tr.rows.map((x: any) => ({ ts: String(x.ts), avgCpuPercent: x.avg_cpu !== null ? Math.round(Number(x.avg_cpu)) : null, avgMemUsedPercent: x.avg_mem !== null ? Math.round(Number(x.avg_mem)) : null }));
        } else {
          const tr = await client.query(
            `WITH buckets AS (
               SELECT generate_series(now() - $2::interval, now(), ($2::interval) / $3::int) AS bucket_start
             )
             SELECT bucket_start AS ts,
                    AVG(dm.cpu_percent) AS avg_cpu,
                    AVG(dm.mem_used_percent) AS avg_mem
             FROM buckets b
             LEFT JOIN device_metrics dm
               ON dm.tenant_id = $1
              AND dm.ts >= b.bucket_start
              AND dm.ts < b.bucket_start + (($2::interval) / $3::int)
             GROUP BY bucket_start
             ORDER BY bucket_start ASC`,
            [tenantId, range, points]
          );
          trendRows = tr.rows.map((x: any) => ({ ts: String(x.ts), avgCpuPercent: x.avg_cpu !== null ? Math.round(Number(x.avg_cpu)) : null, avgMemUsedPercent: x.avg_mem !== null ? Math.round(Number(x.avg_mem)) : null }));
        }

        return reply.send({
          deviceCount,
          activeDeviceCount,
          metricsDeviceCount,
          avgCpuPercent,
          avgMemUsedPercent,
          avgUptimeHours,
          topCpu,
          topMem,
          trend: trendRows,
        });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/monitoring/devices/:id/status_history",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const querySchema = z.object({ range: z.string().default("24h"), points: z.coerce.number().int().positive().max(1000).default(50) });
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) return reply.status(400).send({ message: "Invalid device id" });
      const deviceId = p.data.id;
      const tenantId = (request.user as any)?.tenantId as string;
      const q = querySchema.safeParse(request.query);
      const range = q.success ? q.data.range : "24h";
      const points = q.success ? q.data.points : 50;
      await ensureMetricsTable();
      const schema = await getMetricsSchema();
      const client = await db.connect();
      try {
        if (schema.kind === "legacy") {
          const res = await client.query(
            `SELECT ts, cpu_usage, mem_usage, uptime_seconds
             FROM device_metrics
             WHERE tenant_id = $1 AND device_id = $2 AND ts >= now() - $3::interval
             ORDER BY ts ASC
             LIMIT $4`,
            [tenantId, deviceId, range, points]
          );
          return reply.send({ items: res.rows.map(r => ({ ts: String(r.ts), uptimeTicks: (r.uptime_seconds !== null ? Number(r.uptime_seconds) * 100 : null), cpuPercent: r.cpu_usage as number | null, memUsedPercent: r.mem_usage as number | null })) });
        } else {
          const res = await client.query(
            `SELECT ts, uptime_ticks, cpu_percent, mem_used_percent
             FROM device_metrics
             WHERE tenant_id = $1 AND device_id = $2 AND ts >= now() - $3::interval
             ORDER BY ts ASC
             LIMIT $4`,
            [tenantId, deviceId, range, points]
          );
          return reply.send({ items: res.rows.map(r => ({ ts: String(r.ts), uptimeTicks: r.uptime_ticks as number | null, cpuPercent: r.cpu_percent as number | null, memUsedPercent: r.mem_used_percent as number | null })) });
        }
      } finally {
        client.release();
      }
    }
  );
}

export async function collectMetricsJob(): Promise<void> {
  async function ensureMetricsTable() {
    await db.query(
      `CREATE TABLE IF NOT EXISTS device_metrics (
         id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
         tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
         device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
         ts timestamptz NOT NULL DEFAULT now(),
         uptime_ticks integer,
         cpu_percent integer,
         mem_used_percent integer
       );
       CREATE INDEX IF NOT EXISTS idx_device_metrics_device_ts ON device_metrics (device_id, ts DESC);
       CREATE TABLE IF NOT EXISTS device_live_status (
         device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
         interfaces_summary text,
         updated_at timestamptz DEFAULT now()
       );`
    );
  }
  await ensureMetricsTable();
  const tenants = await db.query(`SELECT id FROM tenants`);
  for (const t of tenants.rows) {
    const tenantId = t.id as string;
    const devices = await db.query(
      `SELECT id FROM devices WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
      [tenantId]
    );
    for (const d of devices.rows) {
      const deviceId = d.id as string;
      const dc = await loadSnmpForDevice(deviceId, tenantId);
      if (!dc) continue;
      const session = createDeviceSession(dc);
      try {
        const uptimeOid = "1.3.6.1.2.1.1.3.0";
        const cpuTableOid = "1.3.6.1.2.1.25.3.3.1.2";
        const memTotalOid = "1.3.6.1.4.1.2021.4.5.0";
        const memAvailOid = "1.3.6.1.4.1.2021.4.6.0";
        const ifOperOid = "1.3.6.1.2.1.2.2.1.8";

        let uptimeTicks: number | null = null;
        try {
          const up = await getAsync(session, [uptimeOid]);
          const v = up[0]?.value;
          uptimeTicks = typeof v === "number" ? v : null;
        } catch {}

        let cpuPercent: number | null = null;
        try {
          const rows = await walkAsync(session, cpuTableOid);
          const vals = rows.map((r) => (typeof r.value === "number" ? r.value : null)).filter((v) => v !== null) as number[];
          if (vals.length) cpuPercent = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        } catch {}

        let memUsedPercent: number | null = null;
        try {
          const [tot] = await getAsync(session, [memTotalOid]);
          const [av] = await getAsync(session, [memAvailOid]);
          const total = typeof tot?.value === "number" ? tot.value : null;
          const avail = typeof av?.value === "number" ? av.value : null;
          if (total && avail && total > 0) {
            const used = total - avail;
            memUsedPercent = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
          }
        } catch {}

        let ifSummary: string | null = null;
        try {
          const rows = await walkAsync(session, ifOperOid);
          rows.sort((a, b) => {
            const idxA = parseInt(a.oid.split('.').pop() || "0");
            const idxB = parseInt(b.oid.split('.').pop() || "0");
            return idxA - idxB;
          });
          ifSummary = rows.map(r => Number(r.value) === 1 ? '1' : '0').join('');
        } catch {}

        if (uptimeTicks !== null || cpuPercent !== null || memUsedPercent !== null) {
          await db.query(
            `INSERT INTO device_metrics (tenant_id, device_id, uptime_ticks, cpu_percent, mem_used_percent)
             VALUES ($1, $2, $3, $4, $5)`,
            [tenantId, deviceId, uptimeTicks, cpuPercent, memUsedPercent]
          );
        }

        if (ifSummary) {
          await db.query(
            `INSERT INTO device_live_status (device_id, interfaces_summary, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (device_id) DO UPDATE SET interfaces_summary = $2, updated_at = now()`,
            [deviceId, ifSummary]
          );
        }
      } catch {} finally {
        try { session.close(); } catch {}
      }
    }
  }
}

export async function collectInventoryJob(): Promise<void> {
  async function ensureInventoryTable() {
    await db.query(
      `CREATE TABLE IF NOT EXISTS device_inventory (
         id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
         tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
         device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
         ts timestamptz NOT NULL DEFAULT now(),
         model text,
         firmware text,
         serial text
       );
       CREATE INDEX IF NOT EXISTS idx_device_inventory_device_ts ON device_inventory (device_id, ts DESC);`
    );
  }
  await ensureInventoryTable();
  const tenants = await db.query(`SELECT id FROM tenants`);
  for (const t of tenants.rows) {
    const tenantId = t.id as string;
    const devices = await db.query(
      `SELECT id FROM devices WHERE tenant_id = $1 AND is_active = true ORDER BY name`,
      [tenantId]
    );
    for (const d of devices.rows) {
      const deviceId = d.id as string;
      const dc = await loadSnmpForDevice(deviceId, tenantId);
      if (!dc) continue;
      const session = createDeviceSession(dc);
      try {
        const sysDescrOid = "1.3.6.1.2.1.1.1.0";
        const modelOid = "1.3.6.1.2.1.47.1.1.1.1.13";
        const serialOid = "1.3.6.1.2.1.47.1.1.1.1.11";
        const fwOidForti = "1.3.6.1.4.1.12356.101.4.1.1.0";
        const serialForti = "1.3.6.1.4.1.12356.101.4.1.3.0";
        const fwOidMikro = "1.3.6.1.4.1.14988.1.1.4.3.0";
        const serialMikro = "1.3.6.1.4.1.14988.1.1.7.3.0";

        let model: string | null = null;
        let firmware: string | null = null;
        let serial: string | null = null;

        try {
          const modelRows = await walkAsync(session, modelOid);
          for (const r of modelRows) { const s = String(r.value).trim(); if (s) { model = s; break; } }
        } catch {}

        try {
          const serialRows = await walkAsync(session, serialOid);
          for (const r of serialRows) { const s = String(r.value).trim(); if (s) { serial = s; break; } }
        } catch {}

        try {
          const sys = await getAsync(session, [sysDescrOid]);
          const s = String(sys[0]?.value || "").trim();
          if (s && !firmware) firmware = s;
        } catch {}

        try {
          if (dc.vendor === "fortigate") {
            const vbs = await getAsync(session, [fwOidForti, serialForti]);
            const fv = String(vbs[0]?.value || "").trim(); if (fv) firmware = fv;
            const sv = String(vbs[1]?.value || "").trim(); if (sv) serial = sv;
          } else if (dc.vendor === "mikrotik") {
            const vbs = await getAsync(session, [fwOidMikro, serialMikro]);
            const fv = String(vbs[0]?.value || "").trim(); if (fv) firmware = fv;
            const sv = String(vbs[1]?.value || "").trim(); if (sv) serial = sv;
          }
        } catch {}

        await db.query(
          `INSERT INTO device_inventory (tenant_id, device_id, model, firmware, serial)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, deviceId, model, firmware, serial]
        );
      } catch {} finally {
        try { session.close(); } catch {}
      }
    }
  }
}
