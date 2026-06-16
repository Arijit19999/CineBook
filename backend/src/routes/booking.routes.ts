import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  checkAvailability,
  holdSeats,
  releaseSeats,
  createBooking,
  getBooking,
  listBookings,
  cancelBooking,
} from '../services/booking.service.js';
import { startPayment, confirmPayment } from '../services/payment.service.js';
import { authenticate } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';

const seatsBody = z.object({ showId: z.string().min(1), seatIds: z.array(z.string().min(1)).min(1) });
const bookBody = z.object({ showId: z.string().min(1), seatIds: z.array(z.string().min(1)).min(1) });
const payBody = z.object({ cardNumber: z.string().min(12) });

export async function bookingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate); // all booking actions require login

  // Seat map for a show, annotated with availability for the current user.
  app.get('/seats', async (req, reply) => {
    const q = z.object({ showId: z.string().min(1) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'ValidationError', details: q.error.flatten() });
    return checkAvailability(q.data.showId, req.user.sub);
  });

  app.post('/hold', async (req, reply) => {
    const body = seatsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return holdSeats(body.data.showId, body.data.seatIds, req.user.sub);
  });

  app.post('/release', async (req, reply) => {
    const body = seatsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return releaseSeats(body.data.showId, body.data.seatIds, req.user.sub);
  });

  app.post('/', { preHandler: bookingLimiter }, async (req, reply) => {
    const body = bookBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return createBooking(body.data.showId, body.data.seatIds, req.user.sub);
  });

  app.get('/', async (req) => listBookings(req.user.sub));

  app.get('/:id', async (req) => {
    const { id } = req.params as { id: string };
    return getBooking(id, req.user.sub);
  });

  app.post('/:id/cancel', async (req) => {
    const { id } = req.params as { id: string };
    return cancelBooking(id, req.user.sub);
  });

  app.post('/:id/pay/start', async (req) => {
    const { id } = req.params as { id: string };
    return startPayment(id, req.user.sub);
  });

  app.post('/:id/pay/confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = payBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });
    return confirmPayment(id, req.user.sub, body.data.cardNumber);
  });
}
