import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { getOrCreateSession } from '../ai/contextManager.js';
import { runOrchestrator } from '../ai/orchestrator.js';

const chatBody = z.object({ message: z.string().min(1), sessionId: z.string().optional() });

export async function chatRoutes(app: FastifyInstance) {
  // Streaming chat over Server-Sent Events. Emits: session, tool, tool_result,
  // delegate, delegate_done, state, message, done, error.
  app.post('/', { preHandler: [authenticate, chatLimiter] }, async (req, reply) => {
    const body = chatBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });

    const session = getOrCreateSession(req.user.sub, body.data.sessionId);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.hijack();
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    // Heartbeat (SSE comment, ignored by clients) so the connection never looks
    // idle during long LLM calls / provider backoff.
    const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 10_000);

    send('session', { sessionId: session.id });
    try {
      await runOrchestrator(session, body.data.message, { userId: req.user.sub, session }, send);
      send('done', {});
    } catch (err) {
      send('error', { error: err instanceof Error ? err.message : 'Agent error' });
    } finally {
      clearInterval(heartbeat);
      reply.raw.end();
    }
  });

  // Non-streaming variant — same loop, collects events; handy for tests/simple clients.
  app.post('/sync', { preHandler: [authenticate, chatLimiter] }, async (req, reply) => {
    const body = chatBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ValidationError', details: body.error.flatten() });

    const session = getOrCreateSession(req.user.sub, body.data.sessionId);
    const events: { event: string; data: unknown }[] = [];
    const reply_ = await runOrchestrator(session, body.data.message, { userId: req.user.sub, session }, (event, data) =>
      events.push({ event, data }),
    );
    return { sessionId: session.id, reply: reply_, state: session.state, events };
  });
}
