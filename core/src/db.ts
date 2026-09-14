import { PrismaClient } from '../generated/prisma/index.js';

declare global {
  var __doppelPrisma: PrismaClient | undefined;
}

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

export const prisma: PrismaClient = globalThis.__doppelPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__doppelPrisma = prisma;
}
