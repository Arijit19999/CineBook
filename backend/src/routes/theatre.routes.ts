import type { FastifyInstance } from 'fastify';
import { listTheatres, getTheatre, getScreen } from '../services/theatre.service.js';
import { authenticate } from '../middleware/auth.js';

export async function theatreRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (req) => {
    const { location } = req.query as { location?: string };
    return listTheatres(location);
  });

  // Screen detail (with seat map). Declared before '/:id' for clarity; the radix
  // router resolves the two-segment path independently regardless.
  app.get('/screens/:screenId', async (req, reply) => {
    const { screenId } = req.params as { screenId: string };
    const screen = await getScreen(screenId);
    if (!screen) return reply.code(404).send({ error: 'Screen not found' });
    return screen;
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const theatre = await getTheatre(id);
    if (!theatre) return reply.code(404).send({ error: 'Theatre not found' });
    return theatre;
  });
}
