import { prisma } from '../config/prisma.js';

// Aggregate business metrics for the admin reports screen.
export async function reportSummary() {
  const [revenue, refunds, confirmed, cancelled, pending, seatsBooked] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'success' } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'refunded' } }),
    prisma.booking.count({ where: { status: 'confirmed' } }),
    prisma.booking.count({ where: { status: 'cancelled' } }),
    prisma.booking.count({ where: { status: 'pending' } }),
    prisma.bookedSeat.count(),
  ]);

  // Occupancy = seats sold across all shows / total seats offered by those shows.
  const shows = await prisma.show.findMany({ include: { screen: { select: { capacity: true } } } });
  const totalCapacity = shows.reduce((sum, s) => sum + s.screen.capacity, 0);

  // Top movies by confirmed revenue (relation grouping done in JS).
  const confirmedBookings = await prisma.booking.findMany({
    where: { status: 'confirmed' },
    include: { show: { include: { movie: { select: { title: true } } } } },
  });
  const byTitle: Record<string, { bookings: number; revenue: number }> = {};
  for (const b of confirmedBookings) {
    const t = b.show.movie.title;
    byTitle[t] ??= { bookings: 0, revenue: 0 };
    byTitle[t].bookings++;
    byTitle[t].revenue += b.totalCost;
  }
  const topMovies = Object.entries(byTitle)
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const successSum = revenue._sum.amount ?? 0; // payments still held (refunds already excluded)
  const refundedSum = refunds._sum.amount ?? 0;
  return {
    // Gross = everything ever successfully charged (incl. amounts later refunded).
    grossRevenue: successSum + refundedSum,
    refunded: refundedSum,
    // Net = money actually kept. 'success' already excludes refunded payments, so
    // net IS the success sum — do NOT subtract refunds again (that double-counted).
    netRevenue: successSum,
    revenue: successSum,
    bookings: { confirmed, cancelled, pending },
    seatsBooked,
    totalCapacity,
    occupancyRate: totalCapacity ? Math.round((seatsBooked / totalCapacity) * 1000) / 10 : 0,
    topMovies,
  };
}
