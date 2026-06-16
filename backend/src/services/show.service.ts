import { prisma } from '../config/prisma.js';
import type { Role } from '@prisma/client';

const CLEANING_GAP_MIN = 30; // mandatory gap between shows on the same screen
const MAX_ADVANCE_DAYS = 30; // shows can be scheduled at most 30 days ahead

export class ShowError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface ShowFilters {
  movieId?: string;
  screenId?: string;
  theatreId?: string;
  date?: string; // YYYY-MM-DD; filters to that calendar day
}

export async function listShows(f: ShowFilters = {}) {
  let dateRange: { gte: Date; lt: Date } | undefined;
  if (f.date) {
    const start = new Date(f.date);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      dateRange = { gte: start, lt: end };
    }
  }
  return prisma.show.findMany({
    where: {
      ...(f.movieId ? { movieId: f.movieId } : {}),
      ...(f.screenId ? { screenId: f.screenId } : {}),
      ...(f.theatreId ? { screen: { theatreId: f.theatreId } } : {}),
      ...(dateRange ? { startTime: dateRange } : {}),
    },
    include: { movie: true, screen: { include: { theatre: true } } },
    orderBy: { startTime: 'asc' },
  });
}

export async function getShow(id: string) {
  return prisma.show.findUnique({
    where: { id },
    include: { movie: true, screen: { include: { theatre: true } } },
  });
}

interface Actor {
  role: Role;
  assignedScreenIds: string[];
}

export interface CreateShowInput {
  movieId: string;
  screenId: string;
  startTime: string | Date;
  basePrice: number;
}

// Creates a show after enforcing all scheduling rules. endTime is derived from
// the movie runtime — callers never set it.
export async function createShow(input: CreateShowInput, actor: Actor) {
  const movie = await prisma.movie.findUnique({ where: { id: input.movieId } });
  if (!movie) throw new ShowError('Movie not found', 404);

  const screen = await prisma.screen.findUnique({ where: { id: input.screenId } });
  if (!screen) throw new ShowError('Screen not found', 404);

  // Hall managers may only schedule on their assigned screens.
  if (actor.role === 'hall_manager' && !actor.assignedScreenIds.includes(input.screenId)) {
    throw new ShowError('You are not assigned to this screen', 403);
  }

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) throw new ShowError('Invalid startTime', 400);

  const now = new Date();
  if (start <= now) throw new ShowError('Show must start in the future', 400);

  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + MAX_ADVANCE_DAYS);
  if (start > maxDate) throw new ShowError(`Show must start within ${MAX_ADVANCE_DAYS} days`, 400);

  const end = new Date(start.getTime() + movie.runtimeMin * 60_000);

  // Overlap check incl. the cleaning gap: two shows conflict if, after expanding
  // by 30 min, their intervals overlap on the same screen.
  const gapMs = CLEANING_GAP_MIN * 60_000;
  const conflict = await prisma.show.findFirst({
    where: {
      screenId: input.screenId,
      startTime: { lt: new Date(end.getTime() + gapMs) },
      endTime: { gt: new Date(start.getTime() - gapMs) },
    },
    include: { movie: true },
  });
  if (conflict) {
    throw new ShowError(
      `Conflicts with "${conflict.movie.title}" (${conflict.startTime.toISOString()} – ${conflict.endTime.toISOString()}). ` +
        `Shows on the same screen need a ${CLEANING_GAP_MIN}-minute gap.`,
      409,
    );
  }

  return prisma.show.create({
    data: {
      movieId: input.movieId,
      screenId: input.screenId,
      startTime: start,
      endTime: end,
      basePrice: input.basePrice,
    },
    include: { movie: true, screen: true },
  });
}

// A show with any bookings cannot be deleted.
export async function deleteShow(id: string, actor: Actor) {
  const show = await prisma.show.findUnique({
    where: { id },
    include: { _count: { select: { bookings: true } } },
  });
  if (!show) throw new ShowError('Show not found', 404);
  if (actor.role === 'hall_manager' && !actor.assignedScreenIds.includes(show.screenId)) {
    throw new ShowError('You are not assigned to this screen', 403);
  }
  if (show._count.bookings > 0) {
    throw new ShowError('Cannot delete a show that already has bookings', 409);
  }
  await prisma.show.delete({ where: { id } });
  return { deleted: true };
}
