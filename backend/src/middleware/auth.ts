import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';

// Verify the bearer token; populates request.user. Use as a preHandler.
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
  }
}

// Verify the token AND require one of the given roles. RBAC is enforced here,
// on the server — never just by hiding UI.
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid token' });
    }
    if (!roles.includes(req.user.role)) {
      return reply.code(403).send({ error: 'Forbidden', message: `Requires role: ${roles.join(' | ')}` });
    }
  };
}
