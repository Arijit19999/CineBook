// CineBook seed — movies, theatres, screens, seats, shows, 3 role users.
// Seed accounts (all OTP = 123456):
//   Customer:     +910000000001
//   Hall Manager: +910000000002 (assigned to Screen 1)
//   Admin:        +910000000003
import { PrismaClient, AgeRating, MovieFormat, ScreenType, SeatCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Build seats for a screen: rows A.. with per-row category + price.
function seatLayout(rows: { row: string; count: number; category: SeatCategory; basePrice: number }[]) {
  const seats: { row: string; number: number; category: SeatCategory; basePrice: number }[] = [];
  for (const r of rows) {
    for (let n = 1; n <= r.count; n++) {
      seats.push({ row: r.row, number: n, category: r.category, basePrice: r.basePrice });
    }
  }
  return seats;
}

// Standard 100-seat layout used by most screens.
const STANDARD_LAYOUT = seatLayout([
  { row: 'A', count: 10, category: SeatCategory.FrontRow, basePrice: 150 },
  { row: 'B', count: 10, category: SeatCategory.FrontRow, basePrice: 150 },
  { row: 'C', count: 10, category: SeatCategory.Standard, basePrice: 220 },
  { row: 'D', count: 10, category: SeatCategory.Standard, basePrice: 220 },
  { row: 'E', count: 10, category: SeatCategory.Standard, basePrice: 220 },
  { row: 'F', count: 10, category: SeatCategory.Premium, basePrice: 320 },
  { row: 'G', count: 10, category: SeatCategory.Premium, basePrice: 320 },
  { row: 'H', count: 10, category: SeatCategory.Premium, basePrice: 320 },
  { row: 'J', count: 8, category: SeatCategory.Recliner, basePrice: 500 },
  { row: 'K', count: 8, category: SeatCategory.Recliner, basePrice: 500 },
]);

// Helper: set time on a given day offset from "today" (local).
function showTime(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Resetting data…');
  // Order matters for FK constraints.
  await prisma.bookedSeat.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.theatre.deleteMany();
  await prisma.adminActivityLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.genre.deleteMany();

  // ---------- Genres ----------
  const genreNames = ['Sci-Fi', 'Action', 'Drama', 'Comedy', 'Thriller', 'Romance', 'Animation', 'Horror'];
  const genres: Record<string, string> = {};
  for (const name of genreNames) {
    const g = await prisma.genre.create({ data: { name } });
    genres[name] = g.id;
  }

  // ---------- Movies ----------
  const movies = await Promise.all([
    prisma.movie.create({
      data: {
        title: 'Interstellar Horizons',
        description: 'A crew rides a wormhole past Saturn to find humanity a new home among the stars.',
        runtimeMin: 169,
        cast: ['Anil Kapoor', 'Deepika Padukone', 'Rajkummar Rao'],
        posterUrl: 'https://picsum.photos/seed/interstellar/400/600',
        trailerUrl: 'https://example.com/trailer/interstellar',
        releaseDate: new Date('2026-05-20'),
        language: 'English',
        ageRating: AgeRating.UA,
        format: MovieFormat.THREE_D,
        genres: { connect: [{ id: genres['Sci-Fi'] }, { id: genres['Drama'] }] },
      },
    }),
    prisma.movie.create({
      data: {
        title: 'Neon Protocol',
        description: 'A hacker and a rogue android race to stop a megacorp from rewriting reality.',
        runtimeMin: 142,
        cast: ['Vijay Sethupathi', 'Tabu', 'Siddharth'],
        posterUrl: 'https://picsum.photos/seed/neon/400/600',
        releaseDate: new Date('2026-06-05'),
        language: 'Hindi',
        ageRating: AgeRating.A,
        format: MovieFormat.THREE_D,
        genres: { connect: [{ id: genres['Sci-Fi'] }, { id: genres['Action'] }, { id: genres['Thriller'] }] },
      },
    }),
    prisma.movie.create({
      data: {
        title: 'Monsoon Letters',
        description: 'Two strangers exchange anonymous letters across a rain-soaked city.',
        runtimeMin: 128,
        cast: ['Alia Bhatt', 'Dhanush'],
        posterUrl: 'https://picsum.photos/seed/monsoon/400/600',
        releaseDate: new Date('2026-04-12'),
        language: 'Hindi',
        ageRating: AgeRating.U,
        format: MovieFormat.TWO_D,
        genres: { connect: [{ id: genres['Romance'] }, { id: genres['Drama'] }] },
      },
    }),
    prisma.movie.create({
      data: {
        title: 'Laugh Riot',
        description: 'A failing comedian accidentally becomes the city mayor for a day.',
        runtimeMin: 117,
        cast: ['Ayushmann Khurrana', 'Bhumi Pednekar'],
        posterUrl: 'https://picsum.photos/seed/laughriot/400/600',
        releaseDate: new Date('2026-06-10'),
        language: 'Hindi',
        ageRating: AgeRating.UA,
        format: MovieFormat.TWO_D,
        genres: { connect: [{ id: genres['Comedy'] }] },
      },
    }),
    prisma.movie.create({
      data: {
        title: 'Edge of Midnight',
        description: 'A detective has until dawn to find a bomb hidden somewhere in the metro.',
        runtimeMin: 134,
        cast: ['Vikram', 'Sai Pallavi'],
        posterUrl: 'https://picsum.photos/seed/midnight/400/600',
        releaseDate: new Date('2026-05-28'),
        language: 'Tamil',
        ageRating: AgeRating.A,
        format: MovieFormat.TWO_D,
        genres: { connect: [{ id: genres['Thriller'] }, { id: genres['Action'] }] },
      },
    }),
  ]);
  const [interstellar, neon] = movies;

  // ---------- Theatres + Screens + Seats ----------
  // Theatre 1 sits in Koramangala (for the demo scenario).
  const pvr = await prisma.theatre.create({
    data: {
      chain: 'PVR',
      location: 'Koramangala',
      address: 'Forum Mall, Koramangala, Bengaluru 560095',
      screens: {
        create: [
          { screenType: ScreenType.IMAX, equipment: ['IMAX', 'Dolby Atmos'], capacity: 96 },
          { screenType: ScreenType.Standard, equipment: ['2K Projector'], capacity: 96 },
        ],
      },
    },
    include: { screens: true },
  });

  const inox = await prisma.theatre.create({
    data: {
      chain: 'INOX',
      location: 'Whitefield',
      address: 'Phoenix Marketcity, Whitefield, Bengaluru 560048',
      screens: {
        create: [
          { screenType: ScreenType.FourDX, equipment: ['4DX', 'Motion Seats'], capacity: 96 },
          { screenType: ScreenType.DolbyAtmos, equipment: ['Dolby Atmos'], capacity: 96 },
        ],
      },
    },
    include: { screens: true },
  });

  const allScreens = [...pvr.screens, ...inox.screens];
  for (const screen of allScreens) {
    await prisma.seat.createMany({
      data: STANDARD_LAYOUT.map((s) => ({ ...s, screenId: screen.id })),
    });
  }
  const screen1 = pvr.screens[0]; // "Screen 1" — assigned to the hall manager

  // ---------- Shows ----------
  // Spread across today..+3 days, with evening slots so the demo can ask for an evening show.
  const showSpecs: { movieId: string; screenId: string; day: number; hour: number; basePrice: number }[] = [
    { movieId: interstellar.id, screenId: pvr.screens[0].id, day: 0, hour: 18, basePrice: 320 },
    { movieId: interstellar.id, screenId: pvr.screens[0].id, day: 0, hour: 21, basePrice: 320 },
    { movieId: interstellar.id, screenId: pvr.screens[0].id, day: 1, hour: 19, basePrice: 320 },
    { movieId: neon.id, screenId: pvr.screens[1].id, day: 0, hour: 20, basePrice: 280 },
    { movieId: neon.id, screenId: inox.screens[0].id, day: 1, hour: 18, basePrice: 350 },
    { movieId: movies[2].id, screenId: pvr.screens[1].id, day: 0, hour: 17, basePrice: 240 },
    { movieId: movies[3].id, screenId: inox.screens[1].id, day: 2, hour: 19, basePrice: 260 },
    { movieId: movies[4].id, screenId: inox.screens[1].id, day: 1, hour: 22, basePrice: 300 },
  ];

  for (const spec of showSpecs) {
    const movie = movies.find((m) => m.id === spec.movieId)!;
    const start = showTime(spec.day, spec.hour);
    const end = new Date(start.getTime() + movie.runtimeMin * 60_000);
    await prisma.show.create({
      data: {
        movieId: spec.movieId,
        screenId: spec.screenId,
        startTime: start,
        endTime: end,
        basePrice: spec.basePrice,
      },
    });
  }

  // ---------- Users (3 roles) ----------
  await prisma.user.create({
    data: { phone: '+910000000001', name: 'Customer Demo', role: 'customer', preferences: { languages: ['Hindi', 'English'], genres: ['Sci-Fi'] } },
  });
  await prisma.user.create({
    data: { phone: '+910000000002', name: 'Manager Demo', role: 'hall_manager', assignedScreenIds: [screen1.id] },
  });
  await prisma.user.create({
    data: { phone: '+910000000003', name: 'Admin Demo', role: 'admin' },
  });

  console.log('Seed complete.');
  console.log(`  Movies: ${movies.length}, Theatres: 2, Screens: ${allScreens.length}, Shows: ${showSpecs.length}`);
  console.log(`  Hall manager assigned to Screen 1 (${screen1.id}), type=${screen1.screenType}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
