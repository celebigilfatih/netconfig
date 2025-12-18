import { db } from "./client.js";
import argon2 from "argon2";

async function main() {
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

    console.log("seed: ok", { tenantId, userId });
  } finally {
    client.release();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

