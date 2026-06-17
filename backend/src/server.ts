import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { authRoutes } from './routes/auth.routes.js';
import { movieRoutes } from './routes/movie.routes.js';
import { theatreRoutes } from './routes/theatre.routes.js';
import { showRoutes } from './routes/show.routes.js';
import { bookingRoutes } from './routes/booking.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { metricsRoutes } from './routes/metrics.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { installTracing } from './middleware/tracing.js';

const app = Fastify({ logger: true });

// Treat an empty JSON body as {} so bodyless action POSTs (pay/start, cancel)
// don't 400 just because the client sent a Content-Type header.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  const text = (body as string).trim();
  if (text === '') return done(null, {});
  try {
    done(null, JSON.parse(text));
  } catch (err) {
    (err as { statusCode?: number }).statusCode = 400;
    done(err as Error, undefined);
  }
});

// Map typed service errors (those carrying a numeric statusCode) to HTTP responses.
app.setErrorHandler((error: Error, req, reply) => {
  const sc = (error as { statusCode?: number }).statusCode;
  const status = Number.isInteger(sc) && (sc as number) >= 400 ? (sc as number) : 500;
  const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
  if (retryAfterMs) reply.header('Retry-After', Math.ceil(retryAfterMs / 1000));
  if (status >= 500) req.log.error(error);
  reply.code(status).send({ error: error.message || 'Internal Server Error' });
});

await app.register(cors, { origin: true });
await app.register(jwt, { secret: env.JWT_SECRET });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024 } }); // 8MB poster cap

// Serve uploaded posters at /uploads/<file>.
const uploadsDir = join(process.cwd(), 'uploads');
mkdirSync(uploadsDir, { recursive: true });
await app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/' });

installTracing(app); // traceId + timing + activity log on every request

app.get('/', async () => ({
  service: 'CineBook API',
  status: 'ok',
  health: '/health',
  endpoints: ['/auth', '/movies', '/theatres', '/shows', '/bookings', '/chat', '/metrics', '/admin'],
}));

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

await app.register(authRoutes, { prefix: '/auth' });
await app.register(movieRoutes, { prefix: '/movies' });
await app.register(theatreRoutes, { prefix: '/theatres' });
await app.register(showRoutes, { prefix: '/shows' });
await app.register(bookingRoutes, { prefix: '/bookings' });
await app.register(chatRoutes, { prefix: '/chat' });
await app.register(metricsRoutes, { prefix: '/metrics' });
await app.register(adminRoutes, { prefix: '/admin' });

app.addHook('onClose', async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

try {
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
