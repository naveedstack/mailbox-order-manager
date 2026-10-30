// Read-side use cases and their authorization: list scoping, filters,
// pagination, and order details visibility.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/domain/errors";
import { listOrdersQuery } from "@/domain/schemas";
import type { Actor } from "@/domain/types";
import { orderService } from "@/server/container";
import { prisma } from "@/server/db";
import { createTestUser, insertOrder, resetDatabase } from "./setup/db";

const query = (params: Record<string, string> = {}) => listOrdersQuery.parse(params);

describe("OrderService read side", () => {
  let alice: Actor & { type: "CUSTOMER" };
  let bob: Actor & { type: "CUSTOMER" };
  let admin: Actor & { type: "ADMIN" };

  beforeEach(async () => {
    await resetDatabase();
    alice = { type: "CUSTOMER", userId: (await createTestUser("CUSTOMER")).id };
    bob = { type: "CUSTOMER", userId: (await createTestUser("CUSTOMER")).id };
    admin = { type: "ADMIN", userId: (await createTestUser("ADMIN")).id };
  });

  afterAll(() => prisma.$disconnect());

  describe("listOrders", () => {
    it("shows a customer only their own orders, whatever the filters", async () => {
      await insertOrder({ customerId: alice.userId, status: "FAILED" });
      await insertOrder({ customerId: bob.userId, status: "FAILED" });

      const page = await orderService.listOrders(alice, query({ status: "FAILED" }));

      expect(page.total).toBe(1);
      expect(page.items.map((o) => o.customerId)).toEqual([alice.userId]);
    });

    it("lets an admin see everyone's orders and filter by status and provider", async () => {
      await insertOrder({ customerId: alice.userId, status: "FAILED", provider: "MICROSOFT" });
      await insertOrder({ customerId: bob.userId, status: "FAILED", provider: "GOOGLE" });
      await insertOrder({ customerId: bob.userId, status: "ACTIVE", provider: "MICROSOFT" });

      expect((await orderService.listOrders(admin, query())).total).toBe(3);
      expect((await orderService.listOrders(admin, query({ status: "FAILED" }))).total).toBe(2);
      const both = await orderService.listOrders(
        admin,
        query({ status: "FAILED", provider: "MICROSOFT" }),
      );
      expect(both.items).toHaveLength(1);
      expect(both.items[0]).toMatchObject({ customerId: alice.userId, provider: "MICROSOFT" });
      expect(both.items[0].customerEmail).toMatch(/@test\.local$/);
    });

    it("paginates newest first", async () => {
      const now = Date.now();
      for (let i = 0; i < 25; i++) {
        await insertOrder({
          customerId: alice.userId,
          status: "PENDING",
          domain: `d${i}.example.com`,
          createdAt: new Date(now - i * 60_000),
        });
      }

      const first = await orderService.listOrders(admin, query());
      const second = await orderService.listOrders(admin, query({ page: "2" }));
      const beyond = await orderService.listOrders(admin, query({ page: "9" }));

      expect(first).toMatchObject({ total: 25, page: 1, pageSize: 20, pageCount: 2 });
      expect(first.items).toHaveLength(20);
      expect(first.items[0].domain).toBe("d0.example.com");
      expect(second.items.map((o) => o.domain)).toEqual(
        ["d20", "d21", "d22", "d23", "d24"].map((d) => `${d}.example.com`),
      );
      expect(beyond.items).toEqual([]);
    });

    it("is not available to the system actor", async () => {
      await expect(orderService.listOrders({ type: "SYSTEM" }, query())).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("getOrderDetails", () => {
    it("returns mailboxes sorted by address and the audit log oldest first, with actor emails", async () => {
      const { id } = await insertOrder({
        customerId: alice.userId,
        status: "FAILED",
        mailboxes: ["ACTIVE", "FAILED"],
      });
      await orderService.retryOrder(admin, id, "provider fixed");

      const details = await orderService.getOrderDetails(admin, id);

      expect(details.mailboxes.map((m) => [m.address, m.status])).toEqual([
        ["mailbox-01@example.com", "ACTIVE"],
        ["mailbox-02@example.com", "PENDING"],
      ]);
      expect(details.auditLog).toHaveLength(1);
      expect(details.auditLog[0]).toMatchObject({
        fromStatus: "FAILED",
        toStatus: "PENDING",
        actorType: "ADMIN",
        reason: "provider fixed",
      });
      expect(details.auditLog[0].actorEmail).toMatch(/^admin-.*@test\.local$/);
      expect(details.customerEmail).toMatch(/^customer-.*@test\.local$/);
    });

    it("lets a customer read their own order", async () => {
      const { id } = await insertOrder({ customerId: alice.userId, status: "PENDING" });

      await expect(orderService.getOrderDetails(alice, id)).resolves.toMatchObject({ id });
    });

    it("hides another customer's order as NotFound (no existence leak)", async () => {
      const { id } = await insertOrder({ customerId: bob.userId, status: "PENDING" });

      await expect(orderService.getOrderDetails(alice, id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("retryOrder", () => {
    it("refuses customers before looking the order up, so ids don't leak", async () => {
      const { id } = await insertOrder({ customerId: alice.userId, status: "FAILED" });

      await expect(orderService.retryOrder(alice, id)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        orderService.retryOrder(alice, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
