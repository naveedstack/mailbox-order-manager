// Idempotent order creation through the real service + repository + Postgres.
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "@/domain/errors";
import type { CreateOrderInput } from "@/domain/schemas";
import type { Actor } from "@/domain/types";
import { orderService } from "@/server/container";
import { prisma } from "@/server/db";
import { createTestUser, resetDatabase } from "./setup/db";

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    domain: "acme.com",
    provider: "GOOGLE",
    mailboxCount: 3,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function counts() {
  const [orders, mailboxes, auditLogs] = await Promise.all([
    prisma.order.count(),
    prisma.mailbox.count(),
    prisma.orderAuditLog.count(),
  ]);
  return { orders, mailboxes, auditLogs };
}

describe("OrderService.createOrder", () => {
  let customerId: string;
  let customer: Actor;

  beforeEach(async () => {
    await resetDatabase();
    customerId = (await createTestUser("CUSTOMER")).id;
    customer = { type: "CUSTOMER", userId: customerId };
  });

  afterAll(() => prisma.$disconnect());

  it("creates a PENDING order with its mailboxes and a creation audit row", async () => {
    const request = input({ mailboxCount: 3 });

    const { order, created } = await orderService.createOrder(customer, request);

    expect(created).toBe(true);
    expect(order).toMatchObject({
      customerId,
      idempotencyKey: request.idempotencyKey,
      domain: "acme.com",
      provider: "GOOGLE",
      mailboxCount: 3,
      status: "PENDING",
      attempts: 0,
    });

    const mailboxes = await prisma.mailbox.findMany({
      where: { orderId: order.id },
      orderBy: { address: "asc" },
    });
    expect(mailboxes.map((m) => [m.address, m.status])).toEqual([
      ["mailbox-01@acme.com", "PENDING"],
      ["mailbox-02@acme.com", "PENDING"],
      ["mailbox-03@acme.com", "PENDING"],
    ]);

    const audit = await prisma.orderAuditLog.findMany({ where: { orderId: order.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      fromStatus: null,
      toStatus: "PENDING",
      actorType: "CUSTOMER",
      actorUserId: customerId,
    });
  });

  it("returns the existing order when the same key is sent twice", async () => {
    const request = input();

    const first = await orderService.createOrder(customer, request);
    const second = await orderService.createOrder(customer, request);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(await counts()).toEqual({ orders: 1, mailboxes: 3, auditLogs: 1 });
  });

  it("creates exactly one order when 5 requests with the same key race", async () => {
    const request = input();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => orderService.createOrder(customer, request)),
    );

    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await counts()).toEqual({ orders: 1, mailboxes: 3, auditLogs: 1 });
  });

  it("scopes the key per customer: same key, different customer -> 2 orders", async () => {
    const other = await createTestUser("CUSTOMER");
    const request = input();

    const a = await orderService.createOrder(customer, request);
    const b = await orderService.createOrder({ type: "CUSTOMER", userId: other.id }, request);

    expect(a.created && b.created).toBe(true);
    expect(a.order.id).not.toBe(b.order.id);
    expect((await counts()).orders).toBe(2);
  });

  it("rejects the same key with a different payload and leaves the original untouched", async () => {
    const request = input({ mailboxCount: 3 });
    const { order } = await orderService.createOrder(customer, request);

    const replay = orderService.createOrder(customer, { ...request, mailboxCount: 5 });

    await expect(replay).rejects.toBeInstanceOf(ConflictError);
    await expect(replay).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.mailboxCount).toBe(3);
    expect(await counts()).toEqual({ orders: 1, mailboxes: 3, auditLogs: 1 });
  });

  it("deduplicates by key, not by payload: different keys -> 2 orders", async () => {
    await orderService.createOrder(customer, input());
    await orderService.createOrder(customer, input());

    expect((await counts()).orders).toBe(2);
  });

  it("only lets customers place orders", async () => {
    const admin = await createTestUser("ADMIN");

    await expect(
      orderService.createOrder({ type: "ADMIN", userId: admin.id }, input()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await counts()).orders).toBe(0);
  });
});
