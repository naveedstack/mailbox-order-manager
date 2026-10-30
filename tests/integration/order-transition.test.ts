// The single status-change gate: conditional update + audit row in one
// transaction, through the real service + repository + Postgres.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, InvalidTransitionError, NotFoundError } from "@/domain/errors";
import type { Actor } from "@/domain/types";
import { orderRepository, orderService } from "@/server/container";
import { prisma } from "@/server/db";
import { createTestUser, insertOrder, resetDatabase } from "./setup/db";

const SYSTEM: Actor = { type: "SYSTEM" };

describe("OrderService.transition", () => {
  let customerId: string;
  let adminId: string;
  let admin: Actor;

  beforeEach(async () => {
    await resetDatabase();
    customerId = (await createTestUser("CUSTOMER")).id;
    adminId = (await createTestUser("ADMIN")).id;
    admin = { type: "ADMIN", userId: adminId };
  });

  afterAll(() => prisma.$disconnect());

  const auditRows = (orderId: string) =>
    prisma.orderAuditLog.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  it("moves PROVISIONING -> ACTIVE and writes one audit row", async () => {
    const { id } = await insertOrder({ customerId, status: "PROVISIONING" });
    const before = await prisma.order.findUniqueOrThrow({ where: { id } });

    const order = await orderService.transition(id, "ACTIVE", SYSTEM, {
      reason: "All mailboxes provisioned",
    });

    expect(order.status).toBe("ACTIVE");
    expect(order.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    const audit = await auditRows(id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromStatus: "PROVISIONING",
      toStatus: "ACTIVE",
      actorType: "SYSTEM",
      actorUserId: null,
      reason: "All mailboxes provisioned",
    });
  });

  it("applies the lastError effect on PROVISIONING -> FAILED", async () => {
    const { id } = await insertOrder({ customerId, status: "PROVISIONING" });

    const order = await orderService.transition(id, "FAILED", SYSTEM, {
      reason: "1 of 1 mailboxes failed",
      effects: { lastError: "1 of 1 mailboxes failed" },
    });

    expect(order).toMatchObject({ status: "FAILED", lastError: "1 of 1 mailboxes failed" });
  });

  it("rejects a transition outside the lifecycle and changes nothing", async () => {
    const { id } = await insertOrder({ customerId, status: "ACTIVE" });

    await expect(orderService.transition(id, "PENDING", admin)).rejects.toBeInstanceOf(
      InvalidTransitionError,
    );
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    expect(await auditRows(id)).toHaveLength(0);
  });

  it("throws NotFoundError for an unknown order", async () => {
    await expect(
      orderService.transition("00000000-0000-4000-8000-000000000000", "ACTIVE", SYSTEM),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets exactly one of two racing transitions win", async () => {
    const { id } = await insertOrder({ customerId, status: "PROVISIONING" });

    const results = await Promise.allSettled([
      orderService.transition(id, "ACTIVE", SYSTEM),
      orderService.transition(id, "FAILED", SYSTEM),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const audit = await auditRows(id);
    expect(audit).toHaveLength(1);
    const final = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(final.status).toBe(audit[0].toStatus);
  });

  it("repository: a stale expectedFrom updates nothing and writes no audit row", async () => {
    const { id } = await insertOrder({ customerId, status: "ACTIVE" });

    const result = await orderRepository.transition(id, "PROVISIONING", "FAILED", {
      actorType: "SYSTEM",
      actorUserId: null,
    });

    expect(result).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    expect(await auditRows(id)).toHaveLength(0);
  });

  it("admin retry with resetFailedMailboxes resets only the FAILED mailboxes", async () => {
    const { id } = await insertOrder({
      customerId,
      status: "FAILED",
      mailboxes: ["ACTIVE", "FAILED", "FAILED"],
    });

    await orderService.transition(id, "PENDING", admin, {
      reason: "Retry",
      effects: { resetFailedMailboxes: true },
    });

    const mailboxes = await prisma.mailbox.findMany({
      where: { orderId: id },
      orderBy: { address: "asc" },
    });
    expect(mailboxes.map((m) => [m.status, m.lastError])).toEqual([
      ["ACTIVE", null],
      ["PENDING", null],
      ["PENDING", null],
    ]);
    const audit = await auditRows(id);
    expect(audit[0]).toMatchObject({
      fromStatus: "FAILED",
      toStatus: "PENDING",
      actorType: "ADMIN",
      actorUserId: adminId,
    });
  });
});
