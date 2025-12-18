import { FastifyRequest, FastifyReply } from "fastify";

export function requireRole(required: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const roles = (request.user as any)?.roles as string[] | undefined;
      if (!roles || !roles.includes(required)) {
        return reply.status(403).send({ message: "Forbidden" });
      }
    } catch {
      return reply.status(401).send({ message: "Unauthorized" });
    }
  };
}

