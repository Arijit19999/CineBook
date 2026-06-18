import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../config/redis.js';

// Fixed-window rate limiter using plain INCR/EXPIRE (works on Upstash, whose free
// tier blocks Lua `EVAL`). The first request in a window sets the TTL; once the
// count exceeds the limit within the window, requests get 429 + Retry-After.
interface LimiterOpts {
  name: string;
  limit: number; // max requests per window
  windowSec: number; // window length in seconds
  keyFn: (req: FastifyRequest) => string | undefined;
}

function makeLimiter(opts: LimiterOpts) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const id = opts.keyFn(req);
    if (!id) return; // can't identify the caller — don't block
    const key = `rl:${opts.name}:${id}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, opts.windowSec);

    if (count > opts.limit) {
      let ttl = await redis.ttl(key);
      if (ttl < 0) {
        ttl = opts.windowSec;
        await redis.expire(key, opts.windowSec); // repair a missing TTL
      }
      reply.header('Retry-After', ttl);
      return reply.code(429).send({ error: `Rate limit exceeded (${opts.name})`, retryAfterSec: ttl });
    }
  };
}

const userKey = (req: FastifyRequest) => (req.user as { sub?: string } | undefined)?.sub;
const phoneKey = (req: FastifyRequest) => (req.body as { phone?: string } | undefined)?.phone;

// 30 chat messages / minute / user
export const chatLimiter = makeLimiter({ name: 'chat', limit: 30, windowSec: 60, keyFn: userKey });
// 5 bookings / hour / user
export const bookingLimiter = makeLimiter({ name: 'booking', limit: 5, windowSec: 3600, keyFn: userKey });
// 5 OTP requests / hour / phone
export const otpLimiter = makeLimiter({ name: 'otp', limit: 5, windowSec: 3600, keyFn: phoneKey });
