import "server-only";

import { PrismaClient } from "@prisma/client";

import { requireDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  __atlasPrisma?: PrismaClient;
};

/**
 * Lazily create the database client so builds and mock-only UI work without a
 * live PostgreSQL server. Migrations are always explicit CLI operations.
 */
export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.__atlasPrisma) return globalForPrisma.__atlasPrisma;

  const client = new PrismaClient({
    datasources: { db: { url: requireDatabaseUrl() } },
  });

  globalForPrisma.__atlasPrisma = client;

  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (!globalForPrisma.__atlasPrisma) return;
  await globalForPrisma.__atlasPrisma.$disconnect();
  globalForPrisma.__atlasPrisma = undefined;
}
