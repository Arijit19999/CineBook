import { prisma } from '../config/prisma.js';
import type { AgeRating, MovieFormat, Role, ScreenType, SeatCategory } from '@prisma/client';

export class AdminError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, phone: true, role: true, assignedScreenIds: true, createdAt: true },
  });
}

export async function updateUser(id: string, data: { role?: Role; assignedScreenIds?: string[] }) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AdminError('User not found', 404);
  return prisma.user.update({
    where: { id },
    data: {
      ...(data.role ? { role: data.role } : {}),
      ...(data.assignedScreenIds ? { assignedScreenIds: data.assignedScreenIds } : {}),
    },
    select: { id: true, name: true, phone: true, role: true, assignedScreenIds: true },
  });
}

export interface CreateMovieInput {
  title: string;
  description: string;
  runtimeMin: number;
  language: string;
  ageRating: AgeRating;
  format: MovieFormat;
  cast?: string[];
  genres?: string[];
  posterUrl?: string;
  releaseDate?: string;
}

export async function createMovie(input: CreateMovieInput) {
  return prisma.movie.create({
    data: {
      title: input.title,
      description: input.description,
      runtimeMin: input.runtimeMin,
      language: input.language,
      ageRating: input.ageRating,
      format: input.format,
      cast: input.cast ?? [],
      posterUrl: input.posterUrl,
      releaseDate: input.releaseDate ? new Date(input.releaseDate) : new Date(),
      genres: {
        connectOrCreate: (input.genres ?? []).map((name) => ({ where: { name }, create: { name } })),
      },
    },
    include: { genres: true },
  });
}

const STANDARD_ROWS: { row: string; count: number; category: SeatCategory; basePrice: number }[] = [
  { row: 'A', count: 10, category: 'FrontRow', basePrice: 150 },
  { row: 'B', count: 10, category: 'Standard', basePrice: 220 },
  { row: 'C', count: 10, category: 'Standard', basePrice: 220 },
  { row: 'D', count: 10, category: 'Premium', basePrice: 320 },
  { row: 'E', count: 8, category: 'Recliner', basePrice: 500 },
];

export interface CreateTheatreInput {
  chain: string;
  location: string;
  address: string;
  screens: { screenType: ScreenType; equipment?: string[] }[];
}

// Creates a theatre with screens, each pre-populated with a standard seat layout.
export async function createTheatre(input: CreateTheatreInput) {
  const capacity = STANDARD_ROWS.reduce((n, r) => n + r.count, 0);
  const theatre = await prisma.theatre.create({
    data: {
      chain: input.chain,
      location: input.location,
      address: input.address,
      screens: { create: input.screens.map((s) => ({ screenType: s.screenType, equipment: s.equipment ?? [], capacity })) },
    },
    include: { screens: true },
  });

  for (const screen of theatre.screens) {
    await prisma.seat.createMany({
      data: STANDARD_ROWS.flatMap((r) =>
        Array.from({ length: r.count }, (_, i) => ({
          screenId: screen.id,
          row: r.row,
          number: i + 1,
          category: r.category,
          basePrice: r.basePrice,
        })),
      ),
    });
  }
  return theatre;
}

export async function listActivity(limit = 50, source?: string) {
  return prisma.adminActivityLog.findMany({
    where: source ? { source } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
}
