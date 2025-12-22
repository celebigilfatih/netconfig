import { config } from "dotenv";
import { buildApp } from "./app.js";
import { performAlarmScan } from "./modules/alarms/alarms.routes.js";
import { collectMetricsJob, collectInventoryJob } from "./modules/monitoring/monitoring.routes.js";
import fs from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import { db } from "./infra/db/client.js";

config();

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || "0.0.0.0";

async function ensureSchema() {
  const client = await db.connect();
  try {
    const res = await client.query(`SELECT to_regclass('public.users') AS t`);
    const exists = !!res.rows[0]?.t;
    if (!exists) {
      const file = path.resolve(process.cwd(), "src/infra/db/schema.sql");
      const sql = fs.readFileSync(file, "utf8");
      await client.query(sql);
    }
  } finally {
    client.release();
  }
}

async function ensureDeviceVendorEnum() {
  const res = await db.query(
    `SELECT e.enumlabel AS val
     FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
     WHERE t.typname = 'device_vendor'`
  );
  const existing = new Set(res.rows.map((r: any) => r.val));
  const values = [
    "fortigate",
    "cisco_ios",
    "mikrotik",
    "juniper",
    "arista_eos",
    "cisco_nx_os",
    "cisco_asa",
    "vyos",
    "huawei_vrp",
    "dell_os10",
    "extreme_xos",
    "brocade",
    "f5_bigip",
    "paloalto_pan_os",
    "checkpoint_gaia",
    "ubiquiti_edgeos",
    "zyxel",
    "netgear",
    "watchguard",
    "hp_comware",
  ];
  for (const v of values) {
    if (!existing.has(v)) {
      await db.query(`ALTER TYPE device_vendor ADD VALUE '${v}'`);
    }
  }
}

async function ensureErrorTables() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS error_logs (
       id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
       tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
       user_id uuid REFERENCES users(id) ON DELETE SET NULL,
       device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
       execution_id uuid REFERENCES backup_executions(id) ON DELETE SET NULL,
       method text,
       url text,
       status_code integer,
       error_code text,
       message text,
       stack text,
       request_body jsonb,
       request_query jsonb,
       severity text,
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_error_logs_tenant_created ON error_logs (tenant_id, created_at DESC)`
  );
  await db.query(
    `CREATE TABLE IF NOT EXISTS backup_step_logs (
       id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
       execution_id uuid REFERENCES backup_executions(id) ON DELETE CASCADE,
       device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
       step_key text NOT NULL,
       status text NOT NULL,
       detail text,
       meta jsonb,
       created_at timestamptz NOT NULL DEFAULT now()
     )`
  );
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_backup_step_logs_exec_created ON backup_step_logs (execution_id, created_at DESC)`
  );
}

async function ensureAdmin() {
  const tenantName = process.env.TENANT_NAME || "Default Tenant";
  const tenantSlug = process.env.TENANT_SLUG || "default";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
  const client = await db.connect();
  try {
    await client.query(`INSERT INTO roles (name) VALUES ('admin') ON CONFLICT DO NOTHING`);
    await client.query(`INSERT INTO roles (name) VALUES ('operator') ON CONFLICT DO NOTHING`);
    const tRes = await client.query(
      `INSERT INTO tenants (name, slug, is_active) VALUES ($1, $2, true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      [tenantName, tenantSlug]
    );
    const tenantId = tRes.rows[0].id as string;
    const hash = await argon2.hash(adminPassword);
    const uRes = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, is_active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()
       RETURNING id`,
      [tenantId, adminEmail, hash]
    );
    const userId = uRes.rows[0].id as string;
    await client.query(
      `INSERT INTO user_roles (user_id, role_name) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
      [userId]
    );
  } finally {
    client.release();
  }
}

async function start() {
  const app = buildApp();
  try {
    await ensureSchema();
    await ensureDeviceVendorEnum();
    await ensureErrorTables();
    await ensureAdmin();
    await app.listen({ port, host });
    setInterval(() => { collectMetricsJob().catch(() => {}); }, 5 * 60 * 1000);
    setInterval(() => { performAlarmScan().catch(() => {}); }, 30 * 1000);
    setInterval(() => { collectInventoryJob().catch(() => {}); }, 60 * 60 * 1000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
