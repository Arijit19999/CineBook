import type { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { requireRole } from '../middleware/auth.js';

// Key operational metrics, derived from the activity log (covers both REST and
// chatbot actions). Admin-only.
export async function metricsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireRole('admin') }, async () => {
    const [total, failures, bySource, byAction] = await Promise.all([
      prisma.adminActivityLog.count(),
      prisma.adminActivityLog.count({ where: { success: false } }),
      prisma.adminActivityLog.groupBy({ by: ['source'], _count: { _all: true } }),
      prisma.adminActivityLog.groupBy({
        by: ['action'],
        _count: { _all: true },
        _avg: { durationMs: true },
        orderBy: { _count: { action: 'desc' } },
        take: 15,
      }),
    ]);

    return {
      totalActions: total,
      failures,
      successRate: total ? Math.round(((total - failures) / total) * 1000) / 10 : 100,
      bySource: Object.fromEntries(bySource.map((s) => [s.source, s._count._all])),
      topActions: byAction.map((a) => ({
        action: a.action,
        count: a._count._all,
        avgDurationMs: a._avg.durationMs ? Math.round(a._avg.durationMs) : null,
      })),
    };
  });
}
