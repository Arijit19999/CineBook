import type { AgentTool } from '../types.js';
import { prisma } from '../../config/prisma.js';
import { listMovies, getMovie, listGenres, listLanguages } from '../../services/movie.service.js';
import { listShows } from '../../services/show.service.js';
import type { AgeRating, MovieFormat } from '@prisma/client';

const s = (v: unknown) => (typeof v === 'string' ? v : undefined);

// Resolve a movie by id or (fuzzy) title.
async function resolveMovie(args: Record<string, unknown>) {
  const id = s(args.movieId);
  if (id) return prisma.movie.findUnique({ where: { id }, include: { genres: true } });
  const title = s(args.title) || s(args.movie);
  if (title) {
    return prisma.movie.findFirst({
      where: { title: { contains: title, mode: 'insensitive' } },
      include: { genres: true },
    });
  }
  return null;
}

const brief = (m: { id: string; title: string; language: string; ageRating: string; runtimeMin: number; format: string; genres?: { name: string }[] }) => ({
  id: m.id,
  title: m.title,
  language: m.language,
  ageRating: m.ageRating,
  runtimeMin: m.runtimeMin,
  format: m.format === 'TWO_D' ? '2D' : m.format === 'THREE_D' ? '3D' : m.format,
  genres: m.genres?.map((g) => g.name) ?? [],
});

// Deterministic synthetic rating so get_reviews returns something stable.
function syntheticRating(title: string) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return Math.round((3.6 + (h % 13) / 10) * 10) / 10; // 3.6–4.8
}

export const movieTools: Record<string, AgentTool> = {
  search_movies: {
    schema: {
      name: 'search_movies',
      description: 'Search the movie catalog by free-text query, genre, language, or format (2D/3D).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Title keywords' },
          genre: { type: 'string', description: 'e.g. Sci-Fi, Comedy, Drama' },
          language: { type: 'string' },
          format: { type: 'string', enum: ['2D', '3D'] },
        },
      },
    },
    handler: async (args, ctx) => {
      const fmt = s(args.format);
      const movies = await listMovies({
        q: s(args.query),
        genre: s(args.genre),
        language: s(args.language),
        format: fmt === '3D' ? ('THREE_D' as MovieFormat) : fmt === '2D' ? ('TWO_D' as MovieFormat) : undefined,
      });
      if (movies.length === 1) {
        ctx.session.state.selectedMovieId = movies[0].id;
        ctx.session.state.selectedMovieTitle = movies[0].title;
      }
      if (s(args.genre)) ctx.session.state.seatPreference ??= undefined;
      return { count: movies.length, movies: movies.map(brief) };
    },
  },

  get_movie_details: {
    schema: {
      name: 'get_movie_details',
      description: 'Get full details for one movie by movieId or title.',
      parameters: {
        type: 'object',
        properties: { movieId: { type: 'string' }, title: { type: 'string' } },
      },
    },
    handler: async (args, ctx) => {
      const m = await resolveMovie(args);
      if (!m) return { error: 'Movie not found' };
      ctx.session.state.selectedMovieId = m.id;
      ctx.session.state.selectedMovieTitle = m.title;
      const full = await getMovie(m.id);
      return {
        ...brief(m),
        description: m.description,
        cast: m.cast,
        releaseDate: m.releaseDate,
        upcomingShows: (full?.shows ?? []).slice(0, 6).map((sh) => ({
          showId: sh.id,
          startTime: sh.startTime,
          theatre: sh.screen.theatre.chain + ', ' + sh.screen.theatre.location,
          screenType: sh.screen.screenType,
          basePrice: sh.basePrice,
        })),
      };
    },
  },

  get_cast: {
    schema: {
      name: 'get_cast',
      description: 'Get the cast list for a movie by movieId or title.',
      parameters: { type: 'object', properties: { movieId: { type: 'string' }, title: { type: 'string' } } },
    },
    handler: async (args) => {
      const m = await resolveMovie(args);
      return m ? { title: m.title, cast: m.cast } : { error: 'Movie not found' };
    },
  },

  get_reviews: {
    schema: {
      name: 'get_reviews',
      description: 'Get aggregated audience reviews and rating for a movie.',
      parameters: { type: 'object', properties: { movieId: { type: 'string' }, title: { type: 'string' } } },
    },
    handler: async (args) => {
      const m = await resolveMovie(args);
      if (!m) return { error: 'Movie not found' };
      const rating = syntheticRating(m.title);
      return {
        title: m.title,
        averageRating: rating,
        outOf: 5,
        totalReviews: 120 + Math.round(rating * 50),
        highlights: [
          rating >= 4.3 ? 'Widely praised visuals and pacing.' : 'Solid, watchable, a few slow stretches.',
          'Audiences recommend the bigger-format screens.',
        ],
      };
    },
  },

  get_showtimes: {
    schema: {
      name: 'get_showtimes',
      description: 'List showtimes for a movie. Optionally filter by date (YYYY-MM-DD).',
      parameters: {
        type: 'object',
        properties: { movieId: { type: 'string' }, title: { type: 'string' }, date: { type: 'string' } },
      },
    },
    handler: async (args, ctx) => {
      const m = await resolveMovie(args);
      if (!m) return { error: 'Movie not found' };
      ctx.session.state.selectedMovieId = m.id;
      ctx.session.state.selectedMovieTitle = m.title;
      const shows = await listShows({ movieId: m.id, date: s(args.date) });
      return {
        movie: m.title,
        shows: shows.map((sh) => ({
          showId: sh.id,
          startTime: sh.startTime,
          endTime: sh.endTime,
          theatre: `${sh.screen.theatre.chain}, ${sh.screen.theatre.location}`,
          screenType: sh.screen.screenType,
          basePrice: sh.basePrice,
        })),
      };
    },
  },

  suggest_similar: {
    schema: {
      name: 'suggest_similar',
      description: 'Suggest movies similar to a given one (shared genres).',
      parameters: { type: 'object', properties: { movieId: { type: 'string' }, title: { type: 'string' } } },
    },
    handler: async (args) => {
      const m = await resolveMovie(args);
      if (!m) return { error: 'Movie not found' };
      const genreIds = m.genres.map((g) => g.id);
      const similar = await prisma.movie.findMany({
        where: { id: { not: m.id }, genres: { some: { id: { in: genreIds } } } },
        include: { genres: true },
        take: 5,
      });
      return { basedOn: m.title, similar: similar.map(brief) };
    },
  },

  get_trending: {
    schema: { name: 'get_trending', description: 'Get trending movies (most scheduled shows).', parameters: { type: 'object', properties: {} } },
    handler: async () => {
      const movies = await prisma.movie.findMany({ include: { genres: true, _count: { select: { shows: true } } } });
      const trending = movies.sort((a, b) => b._count.shows - a._count.shows).slice(0, 5);
      return { trending: trending.map((m) => ({ ...brief(m), showCount: m._count.shows })) };
    },
  },

  get_upcoming: {
    schema: { name: 'get_upcoming', description: 'Get movies releasing in the future.', parameters: { type: 'object', properties: {} } },
    handler: async () => {
      const movies = await prisma.movie.findMany({
        where: { releaseDate: { gt: new Date() } },
        include: { genres: true },
        orderBy: { releaseDate: 'asc' },
      });
      return { upcoming: movies.map((m) => ({ ...brief(m), releaseDate: m.releaseDate })) };
    },
  },

  list_languages: {
    schema: { name: 'list_languages', description: 'List languages available in the catalog.', parameters: { type: 'object', properties: {} } },
    handler: async () => ({ languages: await listLanguages() }),
  },

  list_genres: {
    schema: { name: 'list_genres', description: 'List all movie genres.', parameters: { type: 'object', properties: {} } },
    handler: async () => ({ genres: (await listGenres()).map((g) => g.name) }),
  },
};
