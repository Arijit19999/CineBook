/// <reference types="node" />
// Exit 0 if the database is empty (caller should then seed), exit 1 if it
// already has data (caller should skip seeding). Keeps the hosted demo's data
// stable across restarts instead of wiping it on every boot.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const users = await prisma.user.count().catch(() => 0);
await prisma.$disconnect();

if (users > 0) {
  console.log(`Seed-if-empty: DB already has ${users} users — skipping seed.`);
  process.exit(1);
}
console.log('Seed-if-empty: DB is empty — seeding.');
process.exit(0);
