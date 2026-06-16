import '@fastify/jwt';
import type { Role } from '@prisma/client';

// The shape of our JWT payload + what `request.user` becomes after jwtVerify().
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role; phone: string; name: string };
    user: { sub: string; role: Role; phone: string; name: string };
  }
}
