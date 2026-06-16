// Central env loader with light validation.
import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: required('JWT_SECRET'),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
  GROQ_MODEL: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
};

export const isProd = env.NODE_ENV === 'production';
