import { config } from "dotenv";
import { buildApp } from "./app.js";
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
    await ensureAdmin();
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
