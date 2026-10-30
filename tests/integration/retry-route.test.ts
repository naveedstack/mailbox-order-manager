// POST /api/admin/orders/[id]/retry through the real route handler.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/admin/orders/[id]/retry/route";
import { prisma } from "@/server/db";
import { createTestUser, insertOrder, resetDatabase } from "./setup/db";
import { postRequest, routeParams, sessionCookie } from "./setup/http";

describe("POST /api/admin/orders/[id]/retry", () => {
  let customerId: string;
  let customerCookie: string;
  let adminId: string;
  let adminCookie: string;

  beforeEach(async () => {
    await resetDatabase();
    const customer = await createTestUser("CUSTOMER");
    const admin = await createTestUser("ADMIN");
    customerId = customer.id;
    customerCookie = await sessionCookie(customer);
    adminId = admin.id;
    adminCookie = await sessionCookie(admin);
  });

  afterAll(() => prisma.$disconnect());

  const retry = (id: string, cookie?: string, body?: unknown) =>
    POST(postRequest(`/api/admin/orders/${id}/retry`, { cookie, body }), routeParams({ id }));

  it("moves a FAILED order back to PENDING, resets failed mailboxes and audits it", async () => {
    const { id } = await insertOrder({
      customerId,
      status: "FAILED",
      mailboxes: ["ACTIVE", "FAILED"],
    });

    const res = await retry(id, adminCookie, { reason: "provider fixed" });

    expect(res.status).toBe(200);
    expect((await res.json()).order.status).toBe("PENDING");
    const mailboxes = await prisma.mailbox.findMany({
      where: { orderId: id },
      orderBy: { address: "asc" },
    });
    expect(mailboxes.map((m) => [m.status, m.lastError])).toEqual([
      ["ACTIVE", null],
      ["PENDING", null],
    ]);
    expect(await prisma.orderAuditLog.findMany({ where: { orderId: id } })).toEqual([
      expect.objectContaining({
        fromStatus: "FAILED",
        toStatus: "PENDING",
        actorType: "ADMIN",
        actorUserId: adminId,
        reason: "provider fixed",
      }),
    ]);
  });

  it("works without a body (default reason)", async () => {
    const { id } = await insertOrder({ customerId, status: "FAILED", mailboxes: ["FAILED"] });

    const res = await retry(id, adminCookie);

    expect(res.status).toBe(200);
  });

  it("forbids customers: 403", async () => {
    const { id } = await insertOrder({ customerId, status: "FAILED", mailboxes: ["FAILED"] });

    const res = await retry(id, customerCookie);

    expect(res.status).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe("FAILED");
  });

  it("rejects retrying an ACTIVE order: 409 INVALID_TRANSITION", async () => {
    const { id } = await insertOrder({ customerId, status: "ACTIVE", mailboxes: ["ACTIVE"] });

    const res = await retry(id, adminCookie);

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("INVALID_TRANSITION");
  });

  it("rejects a non-uuid id: 400", async () => {
    const res = await retry("not-a-uuid", adminCookie);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for an unknown order", async () => {
    const res = await retry("00000000-0000-4000-8000-000000000000", adminCookie);

    expect(res.status).toBe(404);
  });

  it("requires a session: 401", async () => {
    const { id } = await insertOrder({ customerId, status: "FAILED" });

    expect((await retry(id)).status).toBe(401);
  });
});
