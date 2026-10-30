// Connectivity smoke test: runs a read-only query through the app's Prisma client.
import "dotenv/config";
import { prisma } from "@/server/db";

async function main(): Promise<void> {
  const [row] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  console.log(`DB OK: ${row?.version ?? "unknown version"}`);
}

main()
  .catch((error: unknown) => {
    console.error("DB check failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
