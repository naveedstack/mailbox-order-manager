// ProvisioningService against real Postgres, with scripted fake providers so
// outcomes are deterministic and instant.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "@/domain/types";
import type { Logger } from "@/lib/logger";
import {
  createProviderRegistry,
  ProviderError,
  type MailboxProvider,
} from "@/providers/mailbox-provider";
import type { MailboxRepository } from "@/repositories/mailbox-repository";
import { mailboxRepository, orderRepository, orderService } from "@/server/container";
import { prisma } from "@/server/db";
import { createProvisioningService } from "@/services/provisioning-service";
import { createTestUser, insertOrder, resetDatabase } from "./setup/db";

function fakeProvider(name: Provider, failAddresses: string[] = []) {
  const calls: string[] = [];
  const provider: MailboxProvider = {
    name,
    async provisionMailbox({ mailboxId, address }) {
      calls.push(address);
      if (failAddresses.includes(address)) {
        throw new ProviderError(name, `simulated failure for ${address}`);
      }
      return { externalId: `ext-${mailboxId}` };
    },
  };
  return { provider, calls };
}

const silentLogger = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("ProvisioningService.processNext", () => {
  let customerId: string;

  beforeEach(async () => {
    await resetDatabase();
    customerId = (await createTestUser("CUSTOMER")).id;
  });

  afterAll(() => prisma.$disconnect());

  function service(
    providers: MailboxProvider[],
    overrides: { mailboxes?: MailboxRepository; logger?: Logger } = {},
  ) {
    return createProvisioningService({
      orders: orderRepository,
      mailboxes: overrides.mailboxes ?? mailboxRepository,
      orderService,
      providers: createProviderRegistry(providers),
      logger: overrides.logger ?? silentLogger(),
    });
  }

  const mailboxesOf = (orderId: string) =>
    prisma.mailbox.findMany({ where: { orderId }, orderBy: { address: "asc" } });
  const auditOf = (orderId: string) =>
    prisma.orderAuditLog.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  it("returns idle when there is nothing to do", async () => {
    await expect(service([fakeProvider("GOOGLE").provider]).processNext()).resolves.toBe("idle");
  });

  it("provisions every mailbox and moves the order to ACTIVE", async () => {
    const google = fakeProvider("GOOGLE");
    const { id } = await insertOrder({
      customerId,
      status: "PENDING",
      mailboxes: ["PENDING", "PENDING", "PENDING"],
    });

    await expect(service([google.provider]).processNext()).resolves.toBe("processed");

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({ status: "ACTIVE", lastError: null });
    const mailboxes = await mailboxesOf(id);
    for (const mb of mailboxes) {
      expect(mb).toMatchObject({ status: "ACTIVE", externalId: `ext-${mb.id}`, attempts: 1 });
    }
    expect((await auditOf(id)).map((a) => [a.fromStatus, a.toStatus, a.actorType, a.reason])).toEqual([
      ["PENDING", "PROVISIONING", "SYSTEM", "Claimed by worker"],
      ["PROVISIONING", "ACTIVE", "SYSTEM", "All 3 mailboxes provisioned"],
    ]);
  });

  it("uses the strategy that matches the order's provider", async () => {
    const google = fakeProvider("GOOGLE");
    const microsoft = fakeProvider("MICROSOFT");
    await insertOrder({ customerId, status: "PENDING", provider: "MICROSOFT" });

    await service([google.provider, microsoft.provider]).processNext();

    expect(microsoft.calls).toHaveLength(1);
    expect(google.calls).toHaveLength(0);
  });

  it("marks the order FAILED when some mailboxes fail, keeping the rest ACTIVE", async () => {
    const google = fakeProvider("GOOGLE", ["mailbox-02@example.com"]);
    const { id } = await insertOrder({
      customerId,
      status: "PENDING",
      mailboxes: ["PENDING", "PENDING", "PENDING"],
    });

    await service([google.provider]).processNext();

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({ status: "FAILED", lastError: "1 of 3 mailboxes failed" });
    expect((await mailboxesOf(id)).map((m) => [m.address, m.status, m.lastError])).toEqual([
      ["mailbox-01@example.com", "ACTIVE", null],
      ["mailbox-02@example.com", "FAILED", "simulated failure for mailbox-02@example.com"],
      ["mailbox-03@example.com", "ACTIVE", null],
    ]);
    expect((await auditOf(id)).at(-1)).toMatchObject({
      fromStatus: "PROVISIONING",
      toStatus: "FAILED",
      reason: "1 of 3 mailboxes failed",
    });
  });

  it("after an admin retry, re-provisions only the mailboxes that failed", async () => {
    const adminId = (await createTestUser("ADMIN")).id;
    const google = fakeProvider("GOOGLE");
    const { id } = await insertOrder({
      customerId,
      status: "FAILED",
      mailboxes: ["ACTIVE", "FAILED"],
    });
    await orderService.transition(id, "PENDING", { type: "ADMIN", userId: adminId }, {
      reason: "Retry",
      effects: { resetFailedMailboxes: true },
    });

    await service([google.provider]).processNext();

    expect(google.calls).toEqual(["mailbox-02@example.com"]);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({ status: "ACTIVE", lastError: null });
  });

  it("fails an order whose mailbox rows are missing, without calling the provider", async () => {
    const google = fakeProvider("GOOGLE");
    const { id } = await insertOrder({
      customerId,
      status: "PENDING",
      mailboxes: [],
      mailboxCount: 1,
    });

    await service([google.provider]).processNext();

    expect(google.calls).toEqual([]);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({ status: "FAILED", lastError: "1 of 1 mailbox failed" });
  });

  it("on an unexpected error, fails the order with a generic message and logs the cause", async () => {
    const logger = silentLogger();
    const brokenMailboxes: MailboxRepository = {
      ...mailboxRepository,
      markActive: async () => {
        throw new Error("connection reset");
      },
    };
    const { id } = await insertOrder({ customerId, status: "PENDING" });

    await expect(
      service([fakeProvider("GOOGLE").provider], { mailboxes: brokenMailboxes, logger }).processNext(),
    ).resolves.toBe("processed");

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({
      status: "FAILED",
      lastError: "Internal error during provisioning",
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
