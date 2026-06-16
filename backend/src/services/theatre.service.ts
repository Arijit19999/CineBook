import { prisma } from '../config/prisma.js';

export async function listTheatres(query?: string) {
  // Tokenize so "PVR, Koramangala" matches a PVR theatre in Koramangala even
  // though chain and location are separate fields.
  const tokens = (query ?? '').split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
  const where =
    tokens.length === 0
      ? {}
      : {
          OR: tokens.flatMap((t) => [
            { location: { contains: t, mode: 'insensitive' as const } },
            { chain: { contains: t, mode: 'insensitive' as const } },
            { address: { contains: t, mode: 'insensitive' as const } },
          ]),
        };
  return prisma.theatre.findMany({ where, include: { screens: true }, orderBy: { chain: 'asc' } });
}

export async function getTheatre(id: string) {
  return prisma.theatre.findUnique({ where: { id }, include: { screens: true } });
}

// Full screen detail incl. its physical seat map (used by the seat-map UI + AI tools).
export async function getScreen(id: string) {
  return prisma.screen.findUnique({
    where: { id },
    include: {
      theatre: true,
      seats: { orderBy: [{ row: 'asc' }, { number: 'asc' }] },
    },
  });
}
