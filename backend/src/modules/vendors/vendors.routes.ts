import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { requireRole } from "../rbac/rbac.middleware.js";
import crypto from "node:crypto";

let initialized = false;
async function ensureTable() {
  if (initialized) return;
  await db.query(
    `CREATE TABLE IF NOT EXISTS vendors (
       id uuid PRIMARY KEY,
       tenant_id uuid NOT NULL,
       slug text NOT NULL,
       name text NOT NULL,
       is_active boolean NOT NULL DEFAULT true,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE (tenant_id, slug)
     )`
  );
  initialized = true;
}

function normalizeSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function ensureDefaultVendors(tenantId: string) {
  const defaults: Array<{ slug: string; name: string }> = [
    { slug: "fortigate", name: "FortiGate" },
    { slug: "cisco_ios", name: "Cisco IOS" },
    { slug: "mikrotik", name: "MikroTik" },
  ];
  for (const d of defaults) {
    await db.query(
      `INSERT INTO vendors (id, tenant_id, slug, name, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [crypto.randomUUID(), tenantId, d.slug, d.name]
    );
  }
}

export function registerVendorRoutes(app: FastifyInstance): void {
  app.get(
    "/vendors",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      await ensureTable();
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      await ensureDefaultVendors(tenantId);
      const querySchema = z.object({
        isActive: z.coerce.boolean().optional(),
        q: z.string().optional(),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .transform((n) => (n > 100 ? 100 : n))
          .default(50),
        offset: z.coerce.number().int().nonnegative().default(0),
      });
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ message: "Invalid query", errors: parsed.error.issues });
      }
      const { isActive, q, limit, offset } = parsed.data;
      const clauses: string[] = ["tenant_id = $1"];
      const params: any[] = [tenantId];
      let i = 2;
      if (isActive !== undefined) { clauses.push(`is_active = $${i++}`); params.push(isActive); }
      if (q && q.trim()) { clauses.push(`(name ILIKE $${i} OR slug ILIKE $${i})`); params.push(`%${q}%`); i++; }
      const sql = `SELECT id, slug, name, is_active, created_at, updated_at
                   FROM vendors WHERE ${clauses.join(" AND ")}
                   ORDER BY name
                   LIMIT $${i} OFFSET $${i + 1}`;
      params.push(limit, offset);
      const res = await db.query(sql, params);
      return reply.send({ items: res.rows });
    }
  );

  app.get(
    "/vendors/:id",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      await ensureTable();
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const res = await db.query(
        `SELECT id, slug, name, is_active, created_at, updated_at FROM vendors WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (res.rowCount === 0) return reply.status(404).send({ message: "Vendor not found" });
      return reply.send({ item: res.rows[0] });
    }
  );

  const createSchema = z.object({ slug: z.string().min(1), name: z.string().min(1), isActive: z.boolean().default(true) });
  app.post(
    "/vendors",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      await ensureTable();
      const body = createSchema.parse(request.body);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const id = crypto.randomUUID();
      const slug = normalizeSlug(body.slug);
      const client = await db.connect();
      try {
        const exists = await client.query(`SELECT 1 FROM vendors WHERE tenant_id = $1 AND slug = $2`, [tenantId, slug]);
        if (exists.rowCount) return reply.status(409).send({ message: "Vendor slug already exists" });
        await client.query(
          `INSERT INTO vendors (id, tenant_id, slug, name, is_active)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, tenantId, slug, body.name, body.isActive]
        );
        return reply.status(201).send({ id });
      } finally {
        client.release();
      }
    }
  );

  const updateSchema = z.object({ slug: z.string().min(1).optional(), name: z.string().min(1).optional(), isActive: z.boolean().optional() });
  app.put(
    "/vendors/:id",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      await ensureTable();
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const body = updateSchema.parse(request.body);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const fields: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (body.slug !== undefined) {
        const slug = normalizeSlug(body.slug);
        const exists = await db.query(`SELECT 1 FROM vendors WHERE tenant_id = $1 AND slug = $2 AND id <> $3`, [tenantId, slug, id]);
        if (exists.rowCount) return reply.status(409).send({ message: "Vendor slug already exists" });
        fields.push(`slug = $${i++}`);
        values.push(slug);
      }
      if (body.name !== undefined) { fields.push(`name = $${i++}`); values.push(body.name); }
      if (body.isActive !== undefined) { fields.push(`is_active = $${i++}`); values.push(body.isActive); }
      if (fields.length === 0) return reply.send({ id });
      await db.query(
        `UPDATE vendors SET ${fields.join(", ")}, updated_at = now() WHERE id = $${i} AND tenant_id = $${i + 1}`,
        [...values, id, tenantId]
      );
      return reply.send({ id });
    }
  );

  app.delete(
    "/vendors/:id",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      await ensureTable();
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const v = await db.query(`SELECT slug FROM vendors WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      if (v.rowCount === 0) return reply.status(404).send({ message: "Vendor not found" });
      const slug = v.rows[0].slug as string;
      const ref = await db.query(`SELECT 1 FROM devices WHERE tenant_id = $1 AND vendor::text = $2 LIMIT 1`, [tenantId, slug]);
      if (ref.rowCount) return reply.status(409).send({ message: "Vendor is referenced by devices" });
      await db.query(`DELETE FROM vendors WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      return reply.status(204).send();
    }
  );

  app.post(
    "/vendors/:id/reassign",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      await ensureTable();
      const paramsSchema = z.object({ id: z.string().uuid() });
      const bodySchema = z.object({ targetSlug: z.string().min(1), targetName: z.string().min(1).optional() });
      const { id } = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const v = await db.query(`SELECT slug FROM vendors WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      if (v.rowCount === 0) return reply.status(404).send({ message: "Vendor not found" });
      const fromSlug = v.rows[0].slug as string;
      const targetSlug = normalizeSlug(body.targetSlug);
      if (!targetSlug || targetSlug === fromSlug) return reply.status(400).send({ message: "Invalid target slug" });
      const ex = await db.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND slug = $2`, [tenantId, targetSlug]);
      if (ex.rowCount === 0) {
        await db.query(
          `INSERT INTO vendors (id, tenant_id, slug, name, is_active)
           VALUES ($1, $2, $3, $4, true)`,
          [crypto.randomUUID(), tenantId, targetSlug, body.targetName ?? targetSlug]
        );
      }
      const moved = await db.query(`UPDATE devices SET vendor = $1, updated_at = now() WHERE tenant_id = $2 AND vendor = $3`, [targetSlug, tenantId, fromSlug]);
      await db.query(`DELETE FROM vendors WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      return reply.send({ moved: moved.rowCount, targetSlug });
    }
  );
}
