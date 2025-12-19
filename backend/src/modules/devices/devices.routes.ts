import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import crypto from "node:crypto";
import { requireRole } from "../rbac/rbac.middleware.js";
import { encryptSecret } from "../../infra/security/aes.js";
import { decryptSecret } from "../../infra/security/aes.js";
import { env } from "../../config/env.js";

export function registerDeviceRoutes(app: FastifyInstance): void {
  app.get("/devices", { preValidation: async (req, rep) => req.jwtVerify() }, async (request, reply) => {
    const user = request.user as any;
    const tenantId = user?.tenantId as string;
    const querySchema = z.object({
      vendor: z.string().min(1).optional(),
      q: z.string().optional(),
      isActive: z.coerce.boolean().optional(),
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
    const { vendor, q, isActive, limit, offset } = parsed.data;
    const where: string[] = ["tenant_id = $1"];
    const params: any[] = [tenantId];
    let idx = 2;
    if (vendor) { where.push(`vendor = $${idx}`); params.push(vendor); idx++; }
    if (isActive !== undefined) { where.push(`is_active = $${idx}`); params.push(isActive); idx++; }
    if (q && q.trim()) { where.push(`(name ILIKE $${idx} OR hostname ILIKE $${idx} OR mgmt_ip::text ILIKE $${idx})`); params.push(`%${q}%`); idx++; }
    const sql = `SELECT id, name, hostname, mgmt_ip, ssh_port, vendor, is_active, created_at, updated_at
                 FROM devices WHERE ${where.join(" AND ")}
                 ORDER BY name
                 LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limit, offset);
    const res = await db.query(sql, params);
    return reply.send({ items: res.rows });
  });

  app.get(
    "/devices/:id",
    { preValidation: async (req, rep) => req.jwtVerify() },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      const res = await db.query(
        `SELECT id, name, hostname, mgmt_ip, ssh_port, vendor, is_active, created_at, updated_at
         FROM devices WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      if (res.rowCount === 0) return reply.status(404).send({ message: "Device not found" });
      return reply.send({ item: res.rows[0] });
    }
  );

  async function ensureVendorsTable() {
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
  }

  async function ensureVendor(tenantId: string, slug: string) {
    await ensureVendorsTable();
    const ex = await db.query(`SELECT 1 FROM vendors WHERE tenant_id = $1 AND slug = $2`, [tenantId, slug]);
    if (ex.rowCount) return;
    const nameMap: Record<string, string> = { fortigate: "FortiGate", cisco_ios: "Cisco IOS", mikrotik: "MikroTik" };
    const name = nameMap[slug] || slug;
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO vendors (id, tenant_id, slug, name, is_active) VALUES ($1, $2, $3, $4, true)`, [id, tenantId, slug, name]);
  }

  const createSchema = z.object({
    name: z.string().min(1),
    hostname: z.string().min(1).optional(),
    mgmtIp: z.string().min(1),
    sshPort: z.number().int().positive().default(22),
    vendor: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    secret: z.string().optional(),
    isActive: z.boolean().default(true),
  });

  app.post(
    "/devices",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;

      const client = await db.connect();
      try {
        await ensureVendor(tenantId, body.vendor);
        const devRes = await client.query(
          `INSERT INTO devices (tenant_id, name, hostname, mgmt_ip, ssh_port, vendor, is_active)
           VALUES ($1, $2, $3, $4::inet, $5, $6, $7)
           RETURNING id`,
          [tenantId, body.name, body.hostname ?? null, body.mgmtIp, body.sshPort, body.vendor, body.isActive]
        );
        const deviceId = devRes.rows[0].id as string;

        const encPassword = encryptSecret(body.password);
        const encSecret = body.secret ? encryptSecret(body.secret) : undefined;

        await client.query(
          `INSERT INTO device_credentials (device_id, username, password_encrypted, password_iv, secret_encrypted, secret_iv)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            deviceId,
            body.username,
            encPassword.ciphertext,
            encPassword.iv,
            encSecret?.ciphertext ?? null,
            encSecret?.iv ?? null,
          ]
        );

        return reply.status(201).send({ id: deviceId });
      } finally {
        client.release();
      }
    }
  );

  app.get(
    "/internal/devices/:id/credentials",
    {
      preValidation: async (request, reply) => {
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
      },
    },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const res = await db.query(
        `SELECT d.tenant_id, dc.username, dc.password_encrypted, dc.password_iv, dc.secret_encrypted, dc.secret_iv
         FROM device_credentials dc
         JOIN devices d ON d.id = dc.device_id
         WHERE dc.device_id = $1`,
        [id]
      );
      if (res.rowCount === 0) return reply.status(404).send({ message: "Credentials not found" });
      const row = res.rows[0];
      const password = decryptSecret(row.password_encrypted, row.password_iv);
      const secret = row.secret_encrypted && row.secret_iv ? decryptSecret(row.secret_encrypted, row.secret_iv) : null;
      return reply.send({
        deviceId: id,
        tenantId: row.tenant_id,
        username: row.username,
        password,
        secret,
      });
    }
  );

  const updateSchema = z.object({
    name: z.string().min(1).optional(),
    hostname: z.string().min(1).optional(),
    mgmtIp: z.string().min(1).optional(),
    sshPort: z.number().int().positive().optional(),
    vendor: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    secret: z.string().optional(),
  });

  app.put(
    "/devices/:id",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const body = updateSchema.parse(request.body);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;

      const client = await db.connect();
      try {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;
        if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
        if (body.hostname !== undefined) { fields.push(`hostname = $${idx++}`); values.push(body.hostname); }
        if (body.mgmtIp !== undefined) { fields.push(`mgmt_ip = $${idx++}::inet`); values.push(body.mgmtIp); }
        if (body.sshPort !== undefined) { fields.push(`ssh_port = $${idx++}`); values.push(body.sshPort); }
        if (body.vendor !== undefined) { await ensureVendor(tenantId, body.vendor); fields.push(`vendor = $${idx++}`); values.push(body.vendor); }
        if (body.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(body.isActive); }
        if (fields.length) {
          await client.query(
            `UPDATE devices SET ${fields.join(", ")}, updated_at = now() WHERE id = $${idx} AND tenant_id = $${idx + 1}`,
            [...values, id, tenantId]
          );
        }

        if (body.username || body.password || body.secret !== undefined) {
          const credRows = await client.query(`SELECT id FROM device_credentials WHERE device_id = $1`, [id]);
          const encPass = body.password ? encryptSecret(body.password) : undefined;
          const encSecret = body.secret !== undefined && body.secret !== null ? encryptSecret(body.secret) : undefined;
          if (credRows.rowCount === 0) {
            await client.query(
              `INSERT INTO device_credentials (device_id, username, password_encrypted, password_iv, secret_encrypted, secret_iv)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                id,
                body.username ?? null,
                encPass?.ciphertext ?? null,
                encPass?.iv ?? null,
                encSecret?.ciphertext ?? null,
                encSecret?.iv ?? null,
              ]
            );
          } else {
            const fields2: string[] = [];
            const vals2: any[] = [];
            let j = 1;
            if (body.username !== undefined) { fields2.push(`username = $${j++}`); vals2.push(body.username); }
            if (encPass) { fields2.push(`password_encrypted = $${j++}`); vals2.push(encPass.ciphertext); fields2.push(`password_iv = $${j++}`); vals2.push(encPass.iv); }
            if (body.secret !== undefined) {
              if (encSecret) {
                fields2.push(`secret_encrypted = $${j++}`); vals2.push(encSecret.ciphertext);
                fields2.push(`secret_iv = $${j++}`); vals2.push(encSecret.iv);
              } else {
                fields2.push(`secret_encrypted = $${j++}`); vals2.push(null);
                fields2.push(`secret_iv = $${j++}`); vals2.push(null);
              }
            }
            if (fields2.length) {
              await client.query(
                `UPDATE device_credentials SET ${fields2.join(", ")} WHERE device_id = $${j}`,
                [...vals2, id]
              );
            }
          }
        }

        return reply.send({ id });
      } finally {
        client.release();
      }
    }
  );

  app.delete(
    "/devices/:id",
    { preValidation: requireRole("admin") },
    async (request, reply) => {
      const paramsSchema = z.object({ id: z.string().uuid() });
      const { id } = paramsSchema.parse(request.params);
      const user = request.user as any;
      const tenantId = user?.tenantId as string;
      await db.query(`DELETE FROM devices WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
      return reply.status(204).send();
    }
  );
}
