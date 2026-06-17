import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { requireRole } from '../middleware/auth.js';
import { listUsers, updateUser, createMovie, createTheatre, listActivity, AdminError } from '../services/admin.service.js';
import { reportSummary } from '../services/report.service.js';

const roleEnum = z.enum(['customer', 'hall_manager', 'admin']);
const ageEnum = z.enum(['U', 'UA', 'A']);
const formatEnum = z.enum(['TWO_D', 'THREE_D']);
const screenTypeEnum = z.enum(['Standard', 'IMAX', 'FourDX', 'DolbyAtmos']);

const updateUserSchema = z.object({ role: roleEnum.optional(), assignedScreenIds: z.array(z.string()).optional() });
const createMovieSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  runtimeMin: z.number().int().positive(),
  language: z.string().min(1),
  ageRating: ageEnum,
  format: formatEnum,
  cast: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  posterUrl: z.string().optional(),
  releaseDate: z.string().optional(),
});
const createTheatreSchema = z.object({
  chain: z.string().min(1),
  location: z.string().min(1),
  address: z.string().min(1),
  screens: z.array(z.object({ screenType: screenTypeEnum, equipment: z.array(z.string()).optional() })).min(1),
});

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('admin'));

  app.get('/users', async () => listUsers());

  app.patch('/users/:id', async (req, reply) => {
    const body = updateUserSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    try {
      return await updateUser((req.params as { id: string }).id, body.data);
    } catch (e) {
      if (e instanceof AdminError) return reply.code(e.statusCode).send({ error: e.message });
      throw e;
    }
  });

  // Upload a poster image; returns a relative URL to store as posterUrl.
  app.post('/upload', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    if (!file.mimetype.startsWith('image/')) return reply.code(400).send({ error: 'Only image files are allowed' });
    const ext = (file.filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const name = `poster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await pipeline(file.file, createWriteStream(join(process.cwd(), 'uploads', name)));
    return { url: `/uploads/${name}` };
  });

  app.post('/movies', async (req, reply) => {
    const body = createMovieSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return createMovie(body.data);
  });

  app.post('/theatres', async (req, reply) => {
    const body = createTheatreSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return createTheatre(body.data);
  });

  app.get('/activity', async (req) => {
    const q = req.query as { limit?: string; source?: string };
    return listActivity(q.limit ? parseInt(q.limit, 10) : 50, q.source);
  });

  app.get('/reports', async () => reportSummary());
}
