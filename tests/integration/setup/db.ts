// Test-only helpers. Tests set up and inspect state with Prisma directly; the
// "repositories are the only Prisma users" rule applies to app code.
import { randomUUID } from "node:crypto";
import type { MailboxStatus, OrderStatus, Provider, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "TRUNCATE TABLE order_audit_logs, mailboxes, orders, users RESTART IDENTITY CASCADE",
  );
}

export async function createTestUser(role: Role = "CUSTOMER"): Promise<{ id: string }> {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${randomUUID()}@test.local`,
      name: `Test ${role}`,
      passwordHash: "not-a-real-hash",
      role,
    },
    select: { id: true },
  });
}

// Puts an order straight into any status (bypassing the service), for
// transition tests. Mailbox statuses are given per mailbox.
export async function insertOrder(options: {
  customerId: string;
  status: OrderStatus;
  mailboxes?: MailboxStatus[];
  domain?: string;
  provider?: Provider;
}): Promise<{ id: string }> {
  const domain = options.domain ?? "example.com";
  const mailboxes = options.mailboxes ?? ["PENDING"];
  return prisma.order.create({
    data: {
      customerId: options.customerId,
      idempotencyKey: randomUUID(),
      domain,
      provider: options.provider ?? "GOOGLE",
      mailboxCount: mailboxes.length,
      status: options.status,
      mailboxes: {
        create: mailboxes.map((status, i) => ({
          address: `mailbox-${String(i + 1).padStart(2, "0")}@${domain}`,
          status,
          lastError: status === "FAILED" ? "simulated failure" : null,
        })),
      },
    },
    select: { id: true },
  });
}
