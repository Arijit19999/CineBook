import type { AgentTool } from '../types.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { listMovies } from '../../services/movie.service.js';

export const profileTools: Record<string, AgentTool> = {
  get_my_preferences: {
    schema: { name: 'get_my_preferences', description: "Get the user's saved preferences (genres, languages, seat type).", parameters: { type: 'object', properties: {} } },
    handler: async (_args, ctx) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      return { preferences: user?.preferences ?? {} };
    },
  },

  update_preferences: {
    schema: {
      name: 'update_preferences',
      description: 'Merge new preferences into the user profile (e.g. favourite genres, languages, seat type).',
      parameters: {
        type: 'object',
        properties: {
          genres: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          seatType: { type: 'string' },
        },
      },
    },
    handler: async (args, ctx) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      const current = (user?.preferences as Record<string, unknown>) ?? {};
      const merged = { ...current };
      if (Array.isArray(args.genres)) merged.genres = args.genres;
      if (Array.isArray(args.languages)) merged.languages = args.languages;
      if (typeof args.seatType === 'string') merged.seatType = args.seatType;
      await prisma.user.update({ where: { id: ctx.userId }, data: { preferences: merged as Prisma.InputJsonValue } });
      if (typeof args.seatType === 'string') ctx.session.state.seatPreference = args.seatType;
      return { updated: true, preferences: merged };
    },
  },

  recommend_for_me: {
    schema: { name: 'recommend_for_me', description: "Recommend movies based on the user's saved preferences.", parameters: { type: 'object', properties: {} } },
    handler: async (_args, ctx) => {
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      const prefs = (user?.preferences as { genres?: string[]; languages?: string[] }) ?? {};
      const genre = prefs.genres?.[0];
      const language = prefs.languages?.[0];
      const movies = await listMovies({ genre, language });
      const pool = movies.length ? movies : await listMovies({});
      return {
        basedOn: { genre: genre ?? 'any', language: language ?? 'any' },
        recommendations: pool.slice(0, 5).map((m) => ({ id: m.id, title: m.title, language: m.language, genres: m.genres.map((g) => g.name) })),
      };
    },
  },
};
