// Guards the test harness itself: integration tests truncate tables, so they
// must be pointed at the migrated *test* database, never the dev one.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

describe("integration test database", () => {
  afterAll(() => prisma.$disconnect());

  it("is the test database, not the dev database", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;

    expect(row?.db).toMatch(/_test$/);
  });

  it("has the migrated schema", async () => {
    await expect(prisma.order.count()).resolves.toBeTypeOf("number");
    await expect(prisma.orderAuditLog.count()).resolves.toBeTypeOf("number");
  });
});
