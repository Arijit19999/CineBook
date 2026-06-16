import { prisma } from '../config/prisma.js';
import { CircuitBreaker, CircuitOpenError } from '../lib/circuitBreaker.js';
import { withRetry } from '../lib/retry.js';

export class PaymentError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 402) {
    super(message);
    this.statusCode = statusCode;
  }
}

// One breaker instance guarding the simulated gateway. After 4 consecutive
// failures it opens for 20s and rejects fast with a friendly message.
const paymentBreaker = new CircuitBreaker({ name: 'payment-gateway', failureThreshold: 4, cooldownMs: 20_000 });

const CARD = {
  ALWAYS_SUCCESS: '4111111111111111',
  ALWAYS_FAIL: '4000000000000002',
  RANDOM_FAIL: '4000000000009995',
};

function genTxnId() {
  return 'txn_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Simulated gateway charge: 1–3s latency, behavior keyed by card number.
// Declines throw PaymentError so retry + circuit breaker treat them as failures.
async function simulateCharge(cardNumber: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
  const card = cardNumber.replace(/\s/g, '');
  if (card === CARD.ALWAYS_FAIL) throw new PaymentError('Card declined');
  if (card === CARD.RANDOM_FAIL && Math.random() < 0.5) throw new PaymentError('Card declined (intermittent failure)');
  return genTxnId();
}

export async function startPayment(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) throw new PaymentError('Booking not found', 404);
  if (booking.status !== 'pending') throw new PaymentError(`Booking is ${booking.status}, cannot pay`, 409);
  return { bookingId, amount: booking.totalCost, gatewayState: paymentBreaker.currentState };
}

export async function confirmPayment(bookingId: string, userId: string, cardNumber: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) throw new PaymentError('Booking not found', 404);
  if (booking.status !== 'pending') throw new PaymentError(`Booking is ${booking.status}, cannot pay`, 409);

  let txnId: string;
  try {
    // Breaker wraps the retrying charge: one confirm = one breaker outcome.
    txnId = await paymentBreaker.exec(() => withRetry(() => simulateCharge(cardNumber), { retries: 2, baseMs: 200 }));
  } catch (err) {
    if (err instanceof CircuitOpenError) throw err; // 503, booking left untouched

    // Declined after retries → record the failure, cancel booking, free seats.
    await prisma.$transaction([
      prisma.payment.upsert({
        where: { bookingId },
        create: { bookingId, amount: booking.totalCost, status: 'failed' },
        update: { status: 'failed', transactionId: null },
      }),
      prisma.bookedSeat.deleteMany({ where: { bookingId } }),
      prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } }),
    ]);
    throw err instanceof PaymentError ? err : new PaymentError('Payment failed');
  }

  await prisma.$transaction([
    prisma.payment.upsert({
      where: { bookingId },
      create: { bookingId, amount: booking.totalCost, status: 'success', transactionId: txnId },
      update: { status: 'success', transactionId: txnId },
    }),
    prisma.booking.update({ where: { id: bookingId }, data: { status: 'confirmed' } }),
  ]);

  return { status: 'success' as const, transactionId: txnId, amount: booking.totalCost };
}
