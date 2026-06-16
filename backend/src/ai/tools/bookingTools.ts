import type { AgentTool } from '../types.js';
import { listTheatres, getScreen } from '../../services/theatre.service.js';
import {
  checkAvailability,
  holdSeats,
  releaseSeats,
  createBooking,
  getBooking,
  listBookings,
  cancelBooking,
} from '../../services/booking.service.js';
import { startPayment, confirmPayment } from '../../services/payment.service.js';
import { applyPromo } from '../../services/promo.service.js';

const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : undefined);

// Accept seat IDs directly, or seat labels like "A3" resolved against the show.
async function resolveSeatIds(showId: string, args: Record<string, unknown>): Promise<string[]> {
  const ids = arr(args.seatIds);
  if (ids?.length) return ids;
  const labels = arr(args.seatLabels);
  if (labels?.length) {
    const avail = await checkAvailability(showId);
    const map = new Map(avail.seats.map((seat) => [`${seat.row}${seat.number}`.toUpperCase(), seat.id]));
    return labels.map((l) => map.get(l.toUpperCase())).filter((x): x is string => Boolean(x));
  }
  return [];
}

export const bookingTools: Record<string, AgentTool> = {
  find_theatres: {
    schema: {
      name: 'find_theatres',
      description: 'Find theatres, optionally filtered by location/area (e.g. Koramangala).',
      parameters: { type: 'object', properties: { location: { type: 'string' } } },
    },
    handler: async (args) => {
      const theatres = await listTheatres(s(args.location));
      return {
        theatres: theatres.map((t) => ({
          id: t.id,
          chain: t.chain,
          location: t.location,
          address: t.address,
          screens: t.screens.map((sc) => ({ screenId: sc.id, type: sc.screenType, capacity: sc.capacity })),
        })),
      };
    },
  },

  get_screen_info: {
    schema: {
      name: 'get_screen_info',
      description: 'Get a screen, its type/equipment and seat categories.',
      parameters: { type: 'object', properties: { screenId: { type: 'string' } }, required: ['screenId'] },
    },
    handler: async (args) => {
      const screen = await getScreen(s(args.screenId) ?? '');
      if (!screen) return { error: 'Screen not found' };
      const byCat: Record<string, { count: number; price: number }> = {};
      for (const seat of screen.seats) {
        byCat[seat.category] ??= { count: 0, price: seat.basePrice };
        byCat[seat.category].count++;
      }
      return { screenId: screen.id, type: screen.screenType, equipment: screen.equipment, capacity: screen.capacity, seatCategories: byCat };
    },
  },

  check_seat_availability: {
    schema: {
      name: 'check_seat_availability',
      description: 'Get the seat map for a show: which seats are available/held/booked, with IDs and prices. Use the returned seat IDs to hold seats.',
      parameters: { type: 'object', properties: { showId: { type: 'string' } }, required: ['showId'] },
    },
    handler: async (args, ctx) => {
      const showId = s(args.showId) ?? '';
      const avail = await checkAvailability(showId, ctx.userId);
      ctx.session.state.selectedShowId = showId;
      const open = avail.seats.filter((x) => x.status === 'available' || x.status === 'held_by_you');
      const counts = avail.seats.reduce<Record<string, number>>((a, x) => ((a[x.status] = (a[x.status] || 0) + 1), a), {});

      // Sample a few seats PER category so every category (incl. Recliner) is
      // represented, while keeping the payload small for token limits.
      const byCat: Record<string, typeof open> = {};
      for (const x of open) (byCat[x.category] ??= []).push(x);
      const sample = Object.values(byCat).flatMap((list) => list.slice(0, 6));
      const availableByCategory = Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, v.length]));

      return {
        showId,
        screenType: avail.screen.type,
        counts,
        availableByCategory,
        availableSeats: sample.map((x) => ({ id: x.id, label: `${x.row}${x.number}`, category: x.category, price: x.price })),
        availableTotal: open.length,
      };
    },
  },

  hold_seats: {
    schema: {
      name: 'hold_seats',
      description: 'Temporarily hold seats for the user (5-minute hold). Provide seatIds from check_seat_availability, or seatLabels like ["A3","A4"].',
      parameters: {
        type: 'object',
        properties: {
          showId: { type: 'string' },
          seatIds: { type: 'array', items: { type: 'string' } },
          seatLabels: { type: 'array', items: { type: 'string' } },
        },
        required: ['showId'],
      },
    },
    handler: async (args, ctx) => {
      const showId = s(args.showId) ?? '';
      const seatIds = await resolveSeatIds(showId, args);
      if (!seatIds.length) return { error: 'No valid seats specified' };
      const res = await holdSeats(showId, seatIds, ctx.userId);
      ctx.session.state.selectedShowId = showId;
      ctx.session.state.heldSeats = seatIds;
      return res;
    },
  },

  release_seats: {
    schema: {
      name: 'release_seats',
      description: 'Release seats the user is holding.',
      parameters: {
        type: 'object',
        properties: { showId: { type: 'string' }, seatIds: { type: 'array', items: { type: 'string' } } },
        required: ['showId', 'seatIds'],
      },
    },
    handler: async (args, ctx) => {
      const showId = s(args.showId) ?? '';
      const seatIds = (await resolveSeatIds(showId, args)) ?? [];
      const res = await releaseSeats(showId, seatIds, ctx.userId);
      ctx.session.state.heldSeats = undefined;
      return res;
    },
  },

  apply_promo_code: {
    schema: {
      name: 'apply_promo_code',
      description: 'Validate a promo code against a subtotal and return the discount. If subtotal is omitted, it is computed from the currently held seats.',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string' }, subtotal: { type: 'number' } },
        required: ['code'],
      },
    },
    handler: async (args, ctx) => {
      let subtotal = typeof args.subtotal === 'number' ? args.subtotal : 0;
      const showId = ctx.session.state.selectedShowId;
      const held = ctx.session.state.heldSeats;
      if (!subtotal && showId && held?.length) {
        const avail = await checkAvailability(showId, ctx.userId);
        subtotal = avail.seats.filter((x) => held.includes(x.id)).reduce((a, x) => a + x.price, 0);
      }
      const result = applyPromo(s(args.code) ?? '', subtotal);
      if (result.valid) ctx.session.state.appliedPromo = { code: result.code!, discount: result.discount };
      return result;
    },
  },

  create_booking: {
    schema: {
      name: 'create_booking',
      description: 'Create a pending booking for held seats. Pass promoCode to apply a validated discount.',
      parameters: {
        type: 'object',
        properties: {
          showId: { type: 'string' },
          seatIds: { type: 'array', items: { type: 'string' } },
          seatLabels: { type: 'array', items: { type: 'string' } },
          promoCode: { type: 'string' },
        },
        required: ['showId'],
      },
    },
    handler: async (args, ctx) => {
      const showId = s(args.showId) ?? '';
      let seatIds = await resolveSeatIds(showId, args);
      if (!seatIds.length && ctx.session.state.heldSeats?.length) seatIds = ctx.session.state.heldSeats;
      const promoCode = s(args.promoCode) ?? ctx.session.state.appliedPromo?.code;
      const booking = await createBooking(showId, seatIds, ctx.userId, promoCode);
      ctx.session.state.lastBookingId = booking.id;
      ctx.session.state.lastBookingStatus = booking.status;
      ctx.session.state.heldSeats = undefined;
      return {
        bookingId: booking.id,
        status: booking.status,
        totalCost: booking.totalCost,
        seats: booking.seats.map((bs) => `${bs.seat.row}${bs.seat.number}`),
        movie: booking.show.movie.title,
        startTime: booking.show.startTime,
      };
    },
  },

  start_payment: {
    schema: {
      name: 'start_payment',
      description: 'Begin payment for a pending booking; returns the amount due.',
      parameters: { type: 'object', properties: { bookingId: { type: 'string' } }, required: ['bookingId'] },
    },
    handler: async (args, ctx) => startPayment(s(args.bookingId) ?? ctx.session.state.lastBookingId ?? '', ctx.userId),
  },

  confirm_payment: {
    schema: {
      name: 'confirm_payment',
      description: 'Confirm payment with a card number. Test cards: 4111111111111111 succeeds, 4000000000000002 fails. Defaults to the success card if none given.',
      parameters: {
        type: 'object',
        properties: { bookingId: { type: 'string' }, cardNumber: { type: 'string' } },
      },
    },
    handler: async (args, ctx) => {
      const bookingId = s(args.bookingId) ?? ctx.session.state.lastBookingId ?? '';
      const res = await confirmPayment(bookingId, ctx.userId, s(args.cardNumber) ?? '4111111111111111');
      ctx.session.state.lastBookingStatus = 'confirmed';
      return res;
    },
  },

  check_booking_status: {
    schema: {
      name: 'check_booking_status',
      description: 'Check status and details of a booking.',
      parameters: { type: 'object', properties: { bookingId: { type: 'string' } } },
    },
    handler: async (args, ctx) => {
      const b = await getBooking(s(args.bookingId) ?? ctx.session.state.lastBookingId ?? '', ctx.userId);
      return {
        bookingId: b.id,
        status: b.status,
        totalCost: b.totalCost,
        seats: b.seats.map((bs) => `${bs.seat.row}${bs.seat.number}`),
        movie: b.show.movie.title,
        startTime: b.show.startTime,
        payment: b.payment ? { status: b.payment.status, transactionId: b.payment.transactionId } : null,
      };
    },
  },

  cancel_booking: {
    schema: {
      name: 'cancel_booking',
      description: 'Cancel a booking (refunds if it was paid) and free its seats.',
      parameters: { type: 'object', properties: { bookingId: { type: 'string' } }, required: ['bookingId'] },
    },
    handler: async (args, ctx) => cancelBooking(s(args.bookingId) ?? '', ctx.userId),
  },

  view_booking_history: {
    schema: { name: 'view_booking_history', description: "List the current user's bookings.", parameters: { type: 'object', properties: {} } },
    handler: async (_args, ctx) => {
      const bookings = await listBookings(ctx.userId);
      return {
        bookings: bookings.map((b) => ({
          bookingId: b.id,
          status: b.status,
          movie: b.show.movie.title,
          startTime: b.show.startTime,
          totalCost: b.totalCost,
          seatCount: b.seats.length,
        })),
      };
    },
  },
};
