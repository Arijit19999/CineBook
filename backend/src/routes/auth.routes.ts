import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requestOtp, verifyOtp, getUserById, AuthError } from '../services/auth.service.js';
import { authenticate } from '../middleware/auth.js';
import { otpLimiter } from '../middleware/rateLimit.js';

const phoneSchema = z.string().regex(/^\+?\d{10,15}$/, 'Invalid phone number');

export async function authRoutes(app: FastifyInstance) {
  app.post('/request-otp', { preHandler: otpLimiter }, async (req, reply) => {
    const body = z.object({ phone: phoneSchema }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    }
    return requestOtp(body.data.phone);
  });

  app.post('/verify-otp', async (req, reply) => {
    const body = z.object({ phone: phoneSchema, code: z.string() }).safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    }
    try {
      const user = await verifyOtp(body.data.phone, body.data.code);
      const token = app.jwt.sign({
        sub: user.id,
        role: user.role,
        phone: user.phone,
        name: user.name,
      });
      return {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role,
          assignedScreenIds: user.assignedScreenIds,
        },
      };
    } catch (e) {
      if (e instanceof AuthError) return reply.code(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    const user = await getUserById(req.user.sub);
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      assignedScreenIds: user.assignedScreenIds,
      preferences: user.preferences,
    };
  });
}
