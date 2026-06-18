# CineBook backend — portable container for Render / Railway / Fly.io.
FROM node:22-slim

# OpenSSL is required by Prisma's query engine on Debian.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (incl. dev: prisma CLI + tsx are needed at boot).
COPY package*.json ./
RUN npm install

# App source + generate the Prisma client.
COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
# Host platforms inject PORT; server.ts reads env.PORT and binds 0.0.0.0.
EXPOSE 3000

# On boot: apply migrations, seed ONLY if the DB is empty (so reviewer data
# survives restarts), then start the API. seed-if-empty exits 0 when empty.
CMD ["sh", "-c", "npx prisma migrate deploy && (npx tsx prisma/seed-if-empty.ts && npx prisma db seed || echo 'DB already seeded — skipping') && npx tsx src/server.ts"]
