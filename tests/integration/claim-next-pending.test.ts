// The worker's safety guarantee: concurrent claims never return the same order.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { orderRepository } from "@/server/container";
import { prisma } from "@/server/db";
import { createTestUser, insertOrder, resetDatabase } from "./setup/db";

describe("OrderRepository.claimNextPending", () => {
  let customerId: string;

  beforeEach(async () => {
    await resetDatabase();
    customerId = (await createTestUser("CUSTOMER")).id;
  });

  afterAll(() => prisma.$disconnect());

  it("hands each PENDING order to exactly one of 20 concurrent claimers", async () => {
    const ids = [];
    for (let i = 0; i < 10; i++) {
      ids.push((await insertOrder({ customerId, status: "PENDING" })).id);
    }
    const before = await prisma.order.findMany({ where: { id: { in: ids } } });
    const updatedBefore = new Map(before.map((o) => [o.id, o.updatedAt.getTime()]));

    const results = await Promise.all(
      Array.from({ length: 20 }, () => orderRepository.claimNextPending()),
    );

    const claimed = results.filter((r) => r !== null);
    expect(claimed).toHaveLength(10);
    expect(results.filter((r) => r === null)).toHaveLength(10);
    expect(new Set(claimed.map((o) => o.id))).toEqual(new Set(ids));

    const after = await prisma.order.findMany({ where: { id: { in: ids } } });
    for (const order of after) {
      expect(order.status).toBe("PROVISIONING");
      expect(order.attempts).toBe(1);
      expect(order.claimedAt).toBeInstanceOf(Date);
      expect(order.updatedAt.getTime()).toBeGreaterThan(updatedBefore.get(order.id)!);
    }

    const audit = await prisma.orderAuditLog.findMany({ where: { orderId: { in: ids } } });
    expect(audit).toHaveLength(10);
    expect(new Set(audit.map((a) => a.orderId)).size).toBe(10);
    for (const row of audit) {
      expect(row).toMatchObject({
        fromStatus: "PENDING",
        toStatus: "PROVISIONING",
        actorType: "SYSTEM",
        actorUserId: null,
      });
    }
  });

  it("returns the claimed order in the same shape as findById", async () => {
    const { id } = await insertOrder({ customerId, status: "PENDING" });

    const claimed = await orderRepository.claimNextPending();

    expect(claimed).toEqual(await orderRepository.findById(id));
    expect(claimed?.createdAt).toBeInstanceOf(Date);
  });

  // The test database runs in a non-UTC zone (see global-setup), so SQL that
  // writes local time instead of UTC is off by hours here.
  it("stamps the claim and its audit row with the current time", async () => {
    const { id } = await insertOrder({ customerId, status: "PENDING" });
    const before = Date.now();

    const claimed = await orderRepository.claimNextPending();

    const after = Date.now();
    const audit = await prisma.orderAuditLog.findFirstOrThrow({ where: { orderId: id } });
    for (const stamp of [claimed!.claimedAt!, claimed!.updatedAt, audit.createdAt]) {
      // 1s slack for clock differences between Node and Postgres.
      expect(stamp.getTime()).toBeGreaterThanOrEqual(before - 1_000);
      expect(stamp.getTime()).toBeLessThanOrEqual(after + 1_000);
    }
  });

  it("only claims PENDING orders", async () => {
    for (const status of ["PROVISIONING", "ACTIVE", "FAILED"] as const) {
      await insertOrder({ customerId, status });
    }

    expect(await orderRepository.claimNextPending()).toBeNull();
    expect(await prisma.orderAuditLog.count()).toBe(0);
  });

  it("claims the oldest PENDING order first", async () => {
    const now = Date.now();
    await insertOrder({ customerId, status: "PENDING", createdAt: new Date(now - 1_000) });
    const oldest = await insertOrder({
      customerId,
      status: "PENDING",
      createdAt: new Date(now - 60_000),
    });
    await insertOrder({ customerId, status: "PENDING", createdAt: new Date(now) });

    expect((await orderRepository.claimNextPending())?.id).toBe(oldest.id);
  });
});
