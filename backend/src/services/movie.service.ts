import { prisma } from '../config/prisma.js';
import type { AgeRating, MovieFormat } from '@prisma/client';

export interface MovieFilters {
  q?: string;
  genre?: string;
  language?: string;
  format?: MovieFormat;
  ageRating?: AgeRating;
}

export async function listMovies(f: MovieFilters = {}) {
  return prisma.movie.findMany({
    where: {
      ...(f.q ? { title: { contains: f.q, mode: 'insensitive' } } : {}),
      ...(f.language ? { language: { equals: f.language, mode: 'insensitive' } } : {}),
      ...(f.format ? { format: f.format } : {}),
      ...(f.ageRating ? { ageRating: f.ageRating } : {}),
      ...(f.genre ? { genres: { some: { name: { equals: f.genre, mode: 'insensitive' } } } } : {}),
    },
    include: { genres: true },
    orderBy: { releaseDate: 'desc' },
  });
}

export async function getMovie(id: string) {
  return prisma.movie.findUnique({
    where: { id },
    include: {
      genres: true,
      shows: {
        orderBy: { startTime: 'asc' },
        include: { screen: { include: { theatre: true } } },
      },
    },
  });
}

export async function listGenres() {
  return prisma.genre.findMany({ orderBy: { name: 'asc' } });
}

export async function listLanguages() {
  const rows = await prisma.movie.findMany({
    distinct: ['language'],
    select: { language: true },
    orderBy: { language: 'asc' },
  });
  return rows.map((r) => r.language);
}
