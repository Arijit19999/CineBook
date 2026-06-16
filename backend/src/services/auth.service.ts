import { prisma } from '../config/prisma.js';

// Simulated OTP: a single fixed dev code for every phone.
export const FIXED_OTP = '123456';

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

// "Send" an OTP. In this simulation it's always the fixed code.
export async function requestOtp(phone: string) {
  return { phone, sent: true, devHint: `Use OTP ${FIXED_OTP}` };
}

// Verify OTP and resolve the user. Unknown phones are auto-registered as customers
// (seeded accounts keep their assigned roles).
export async function verifyOtp(phone: string, code: string) {
  if (code !== FIXED_OTP) throw new AuthError('Invalid OTP', 401);

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name: 'New Customer', role: 'customer' } });
  }
  return user;
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}
