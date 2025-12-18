import { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../../infra/db/client.js";
import { verifyPassword } from "../../infra/security/crypto.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/auth/login", async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      tenantSlug: z.string().min(1),
    });
    const body = bodySchema.parse(request.body);

    const client = await db.connect();
    try {
      const tenantRes = await client.query(
        `SELECT id FROM tenants WHERE slug = $1 AND is_active = true`,
        [body.tenantSlug]
      );
      if (tenantRes.rowCount === 0) {
        return reply.status(401).send({ message: "Invalid tenant" });
      }
      const tenantId = tenantRes.rows[0].id as string;

      const userRes = await client.query(
        `SELECT id, password_hash FROM users WHERE tenant_id = $1 AND email = $2 AND is_active = true`,
        [tenantId, body.email]
      );
      if (userRes.rowCount === 0) {
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      const { id: userId, password_hash } = userRes.rows[0];
      const ok = await verifyPassword(password_hash, body.password);
      if (!ok) {
        return reply.status(401).send({ message: "Invalid credentials" });
      }

      const rolesRes = await client.query(
        `SELECT role_name FROM user_roles WHERE user_id = $1`,
        [userId]
      );
      const roles = rolesRes.rows.map((r: { role_name: string }) => r.role_name);

      const token = await reply.jwtSign({
        sub: userId,
        tenantId,
        roles,
      });

      return reply.send({ token });
    } finally {
      client.release();
    }
  });
}
