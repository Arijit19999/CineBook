import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';

interface Traced {
  traceId?: string;
  startTime?: number;
}

function actorOf(req: FastifyRequest): string | null {
  return (req.user as { sub?: string } | undefined)?.sub ?? null;
}

// Installs request tracing on the root instance: every request gets a traceId and
// timing, logged with {when, what, who, durationMs, success}. Mutating requests are
// also persisted to the activity log (Request Tracking + Activity Logs in one place).
export function installTracing(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    const t = req as FastifyRequest & Traced;
    t.traceId = randomUUID();
    t.startTime = Date.now();
    reply.header('x-trace-id', t.traceId);
  });

  app.addHook('onResponse', async (req, reply) => {
    const t = req as FastifyRequest & Traced;
    const durationMs = Date.now() - (t.startTime ?? Date.now());
    const route = req.routeOptions?.url ?? req.url;

    req.log.info(
      { traceId: t.traceId, method: req.method, route, statusCode: reply.statusCode, durationMs, who: actorOf(req) ?? 'anon' },
      'request',
    );

    if (req.method !== 'GET' && req.method !== 'HEAD' && route !== '/health') {
      prisma.adminActivityLog
        .create({
          data: {
            actorId: actorOf(req),
            action: `${req.method} ${route}`,
            targetType: 'http',
            durationMs,
            success: reply.statusCode < 400,
            source: 'rest',
          },
        })
        .catch(() => {});
    }
  });
}
