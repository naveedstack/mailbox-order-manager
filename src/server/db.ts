import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One PrismaClient (and so one connection pool) per process. In dev, Next.js
// hot reload re-evaluates modules, so the instance is cached on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      // Every session runs in UTC, whatever the server's default. Prisma reads
      // and writes timestamps as UTC, while SQL now() (the worker claim) uses
      // the session zone; on a non-UTC server the two disagreed by hours.
      options: "-c TimeZone=UTC",
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
