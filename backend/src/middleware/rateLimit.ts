import type { FastifyReply, FastifyRequest } from 'fastify';
import { redis } from '../config/redis.js';

// Atomic token-bucket in Redis. Refills continuously at refillPerSec up to capacity.
// Returns {allowed (1/0), remainingTokens}.
const BUCKET_LUA = `
local data = redis.call('hmget', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + elapsed * refill)
local allowed = 0
if tokens >= cost then allowed = 1; tokens = tokens - cost end
redis.call('hset', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('expire', KEYS[1], math.ceil(capacity / refill) + 1)
return {allowed, tostring(tokens)}`;

interface LimiterOpts {
  name: string;
  capacity: number; // burst size
  refillPerSec: number; // sustained rate
  keyFn: (req: FastifyRequest) => string | undefined;
}

function makeLimiter(opts: LimiterOpts) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const id = opts.keyFn(req);
    if (!id) return; // can't identify the caller — don't block
    const key = `rl:${opts.name}:${id}`;
    const [allowed, tokensStr] = (await redis.eval(
      BUCKET_LUA,
      1,
      key,
      String(opts.capacity),
      String(opts.refillPerSec),
      String(Date.now()),
      '1',
    )) as [number, string];

    if (!allowed) {
      const remaining = parseFloat(tokensStr);
      const retryAfter = Math.max(1, Math.ceil((1 - remaining) / opts.refillPerSec));
      reply.header('Retry-After', retryAfter);
      return reply.code(429).send({ error: `Rate limit exceeded (${opts.name})`, retryAfterSec: retryAfter });
    }
  };
}

const userKey = (req: FastifyRequest) => (req.user as { sub?: string } | undefined)?.sub;
const phoneKey = (req: FastifyRequest) => (req.body as { phone?: string } | undefined)?.phone;

// 30 chat messages / minute / user
export const chatLimiter = makeLimiter({ name: 'chat', capacity: 30, refillPerSec: 30 / 60, keyFn: userKey });
// 5 bookings / hour / user
export const bookingLimiter = makeLimiter({ name: 'booking', capacity: 5, refillPerSec: 5 / 3600, keyFn: userKey });
// 5 OTP requests / hour / phone
export const otpLimiter = makeLimiter({ name: 'otp', capacity: 5, refillPerSec: 5 / 3600, keyFn: phoneKey });
