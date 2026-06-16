import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listShows, getShow, createShow, deleteShow, ShowError } from '../services/show.service.js';
import { getUserById } from '../services/auth.service.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const createShowSchema = z.object({
  movieId: z.string().min(1),
  screenId: z.string().min(1),
  startTime: z.string().min(1), // ISO datetime
  basePrice: z.number().int().positive(),
});

export async function showRoutes(app: FastifyInstance) {
  // Reads: any authenticated user.
  app.get('/', { preHandler: authenticate }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return listShows({ movieId: q.movieId, screenId: q.screenId, theatreId: q.theatreId, date: q.date });
  });

  app.get('/:id', { preHandler: authenticate }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const show = await getShow(id);
    if (!show) return reply.code(404).send({ error: 'Show not found' });
    return show;
  });

  // Writes: hall managers (their screens) + admins.
  app.post('/', { preHandler: requireRole('hall_manager', 'admin') }, async (req, reply) => {
    const body = createShowSchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    }
    const actor = await getUserById(req.user.sub);
    if (!actor) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      return await createShow(body.data, { role: actor.role, assignedScreenIds: actor.assignedScreenIds });
    } catch (e) {
      if (e instanceof ShowError) return reply.code(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  app.delete('/:id', { preHandler: requireRole('hall_manager', 'admin') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = await getUserById(req.user.sub);
    if (!actor) return reply.code(401).send({ error: 'Unauthorized' });
    try {
      return await deleteShow(id, { role: actor.role, assignedScreenIds: actor.assignedScreenIds });
    } catch (e) {
      if (e instanceof ShowError) return reply.code(e.statusCode).send({ error: e.message });
      throw e;
    }
  });
}
