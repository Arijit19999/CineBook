import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { applyPromo } from './promo.service.js';

export class BookingError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const HOLD_TTL = 300; // seconds — matches the SeatHold TTL in the plan
const holdKey = (showId: string, seatId: string) => `hold:${showId}:${seatId}`;

// Acquire all holds atomically: if ANY key is held by another user, abort and
// touch nothing; otherwise set them all. Returns 'OK' or the conflicting key.
// Re-holding your own seats is allowed (refreshes TTL) → idempotent.
const ACQUIRE_LUA = `
for i=1,#KEYS do
  local v = redis.call('get', KEYS[i])
  if v and v ~= ARGV[1] then return KEYS[i] end
end
for i=1,#KEYS do redis.call('set', KEYS[i], ARGV[1], 'EX', ARGV[2]) end
return 'OK'`;

// Release only the holds this user owns.
const RELEASE_LUA = `
local released = 0
for i=1,#KEYS do
  if redis.call('get', KEYS[i]) == ARGV[1] then
    released = released + redis.call('del', KEYS[i])
  end
end
return released`;

export type SeatStatus = 'available' | 'held' | 'held_by_you' | 'booked';

export async function checkAvailability(showId: string, userId?: string) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { screen: { include: { seats: { orderBy: [{ row: 'asc' }, { number: 'asc' }] } } } },
  });
  if (!show) throw new BookingError('Show not found', 404);

  const seats = show.screen.seats;
  const booked = await prisma.bookedSeat.findMany({ where: { showId }, select: { seatId: true } });
  const bookedSet = new Set(booked.map((b) => b.seatId));
  const holdVals = seats.length ? await redis.mget(seats.map((s) => holdKey(showId, s.id))) : [];

  return {
    showId,
    screen: { id: show.screenId, type: show.screen.screenType, capacity: show.screen.capacity },
    seats: seats.map((s, i) => {
      const holder = holdVals[i];
      let status: SeatStatus = 'available';
      if (bookedSet.has(s.id)) status = 'booked';
      else if (holder) status = holder === userId ? 'held_by_you' : 'held';
      return { id: s.id, row: s.row, number: s.number, category: s.category, price: s.basePrice, status };
    }),
  };
}

// Validate seats belong to the show's screen and aren't already booked.
async function validateSeats(showId: string, seatIds: string[]) {
  if (!seatIds.length) throw new BookingError('No seats specified', 400);
  const show = await prisma.show.findUnique({ where: { id: showId } });
  if (!show) throw new BookingError('Show not found', 404);
  const seats = await prisma.seat.findMany({ where: { id: { in: seatIds }, screenId: show.screenId } });
  if (seats.length !== seatIds.length) throw new BookingError('Some seats are invalid for this show', 400);
  const alreadyBooked = await prisma.bookedSeat.findMany({ where: { showId, seatId: { in: seatIds } } });
  if (alreadyBooked.length) throw new BookingError('Some seats are already booked', 409);
  return { show, seats };
}

export async function holdSeats(showId: string, seatIds: string[], userId: string) {
  await validateSeats(showId, seatIds);
  const keys = seatIds.map((id) => holdKey(showId, id));
  const res = (await redis.eval(ACQUIRE_LUA, keys.length, ...keys, userId, String(HOLD_TTL))) as string;
  if (res !== 'OK') {
    const seatId = res.split(':').pop();
    throw new BookingError(`Seat ${seatId} is currently held by someone else`, 409);
  }
  return { showId, held: seatIds, expiresInSec: HOLD_TTL };
}

export async function releaseSeats(showId: string, seatIds: string[], userId: string) {
  if (!seatIds.length) return { released: 0 };
  const keys = seatIds.map((id) => holdKey(showId, id));
  const released = (await redis.eval(RELEASE_LUA, keys.length, ...keys, userId)) as number;
  return { released };
}

// Turn held seats into a pending booking. The DB unique(showId, seatId) is the
// final backstop against a double-book even if two requests race.
export async function createBooking(showId: string, seatIds: string[], userId: string, promoCode?: string) {
  const { seats } = await validateSeats(showId, seatIds);

  // Every seat must currently be held by this user.
  const holds = await redis.mget(seatIds.map((id) => holdKey(showId, id)));
  if (holds.some((h) => h !== userId)) {
    throw new BookingError('Please hold the seats first (a hold may have expired or belongs to someone else)', 409);
  }

  const subtotal = seats.reduce((sum, s) => sum + s.basePrice, 0);
  let total = subtotal;
  if (promoCode) {
    const promo = applyPromo(promoCode, subtotal);
    if (!promo.valid) throw new BookingError(promo.message, 400);
    total = promo.finalAmount;
  }

  let booking;
  try {
    booking = await prisma.booking.create({
      data: {
        userId,
        showId,
        status: 'pending',
        totalCost: total,
        seats: { create: seats.map((s) => ({ seatId: s.id, showId, pricePaid: s.basePrice })) },
      },
      include: {
        seats: { include: { seat: true } },
        show: { include: { movie: true, screen: { include: { theatre: true } } } },
      },
    });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      throw new BookingError('One or more seats were just booked by someone else', 409);
    }
    throw e;
  }

  // Holds are no longer needed — the DB rows now reserve the seats.
  await releaseSeats(showId, seatIds, userId);
  return booking;
}

export async function getBooking(id: string, userId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      seats: { include: { seat: true } },
      show: { include: { movie: true, screen: { include: { theatre: true } } } },
      payment: true,
    },
  });
  if (!booking || booking.userId !== userId) throw new BookingError('Booking not found', 404);
  return booking;
}

export async function listBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { show: { include: { movie: true } }, seats: { include: { seat: true } }, payment: true },
    orderBy: { createdAt: 'desc' },
  });
}

// Apply a promo code to a still-pending booking, updating its total.
export async function applyPromoToBooking(bookingId: string, userId: string, code: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { seats: true } });
  if (!booking || booking.userId !== userId) throw new BookingError('Booking not found', 404);
  if (booking.status !== 'pending') throw new BookingError(`Booking is ${booking.status}, cannot apply a promo`, 409);

  const subtotal = booking.seats.reduce((sum, s) => sum + s.pricePaid, 0);
  const promo = applyPromo(code, subtotal);
  if (!promo.valid) throw new BookingError(promo.message, 400);

  await prisma.booking.update({ where: { id: bookingId }, data: { totalCost: promo.finalAmount } });
  return { bookingId, subtotal, discount: promo.discount, totalCost: promo.finalAmount, message: promo.message };
}

// Cancel a booking, freeing its seats. Refunds the payment if one succeeded.
export async function cancelBooking(id: string, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id }, include: { payment: true } });
  if (!booking || booking.userId !== userId) throw new BookingError('Booking not found', 404);
  if (booking.status === 'cancelled') throw new BookingError('Booking is already cancelled', 409);

  const wasPaid = booking.payment?.status === 'success';
  await prisma.$transaction(async (tx) => {
    if (wasPaid) {
      await tx.payment.update({ where: { bookingId: id }, data: { status: 'refunded' } });
    }
    await tx.bookedSeat.deleteMany({ where: { bookingId: id } }); // frees the seats
    await tx.booking.update({ where: { id }, data: { status: 'cancelled' } });
  });

  return { cancelled: true, refunded: wasPaid };
}
