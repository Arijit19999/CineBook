import type { FastifyInstance } from 'fastify';
import type { AgeRating, MovieFormat } from '@prisma/client';
import { listMovies, getMovie, listGenres, listLanguages } from '../services/movie.service.js';
import { authenticate } from '../middleware/auth.js';

export async function movieRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate); // all movie browsing requires login

  app.get('/', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return listMovies({
      q: q.q,
      genre: q.genre,
      language: q.language,
      format: q.format as MovieFormat | undefined,
      ageRating: q.ageRating as AgeRating | undefined,
    });
  });

  app.get('/genres', async () => listGenres());

  app.get('/languages', async () => listLanguages());

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const movie = await getMovie(id);
    if (!movie) return reply.code(404).send({ error: 'Movie not found' });
    return movie;
  });
}
