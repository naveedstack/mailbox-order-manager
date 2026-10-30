// Seed data: one admin, two customers, and orders in PENDING / ACTIVE / FAILED
// whose mailboxes and audit history are consistent with their status.
//
// Uses Prisma directly: this is a dev/ops script, not app code, so the
// "repositories are the only Prisma users" rule doesn't apply here.
//
// Idempotent: users are upserted and the seed users' orders are deleted and
// recreated (mailboxes and audit rows cascade).
//
// No PROVISIONING orders on purpose: no worker owns them, so they would be stuck.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { mailboxAddresses } from "@/domain/mailbox";
import type { ActorType, OrderStatus, Provider, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";

const USERS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@example.com", name: "Ada Admin", role: "ADMIN", password: "Admin123!" },
  { email: "alice@example.com", name: "Alice Customer", role: "CUSTOMER", password: "Customer123!" },
  { email: "bob@example.com", name: "Bob Customer", role: "CUSTOMER", password: "Customer123!" },
];

type SeedOrder = {
  customer: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  status: Extract<OrderStatus, "PENDING" | "ACTIVE" | "FAILED">;
  failedMailboxes?: number; // FAILED orders only, at least 1
  daysAgo: number;
};

const ORDERS: SeedOrder[] = [
  { customer: "alice@example.com", domain: "acme-mail.com", provider: "GOOGLE", mailboxCount: 3, status: "ACTIVE", daysAgo: 9 },
  { customer: "alice@example.com", domain: "acme-outreach.com", provider: "MICROSOFT", mailboxCount: 2, status: "FAILED", failedMailboxes: 1, daysAgo: 7 },
  { customer: "alice@example.com", domain: "acme-sales.com", provider: "GOOGLE", mailboxCount: 2, status: "PENDING", daysAgo: 1 },
  { customer: "alice@example.com", domain: "acme-growth.com", provider: "MICROSOFT", mailboxCount: 4, status: "ACTIVE", daysAgo: 12 },
  { customer: "alice@example.com", domain: "acme-partners.com", provider: "GOOGLE", mailboxCount: 6, status: "FAILED", failedMailboxes: 2, daysAgo: 11 },
  { customer: "alice@example.com", domain: "acme-support.com", provider: "GOOGLE", mailboxCount: 1, status: "ACTIVE", daysAgo: 14 },
  { customer: "bob@example.com", domain: "globex.io", provider: "MICROSOFT", mailboxCount: 5, status: "ACTIVE", daysAgo: 8 },
  { customer: "bob@example.com", domain: "globex-leads.io", provider: "GOOGLE", mailboxCount: 4, status: "FAILED", failedMailboxes: 2, daysAgo: 6 },
  { customer: "bob@example.com", domain: "initech.dev", provider: "MICROSOFT", mailboxCount: 1, status: "PENDING", daysAgo: 2 },
  { customer: "bob@example.com", domain: "globex-eu.io", provider: "GOOGLE", mailboxCount: 10, status: "ACTIVE", daysAgo: 13 },
  { customer: "bob@example.com", domain: "globex-us.io", provider: "MICROSOFT", mailboxCount: 3, status: "FAILED", failedMailboxes: 3, daysAgo: 10 },
  { customer: "bob@example.com", domain: "initech-sales.dev", provider: "MICROSOFT", mailboxCount: 2, status: "ACTIVE", daysAgo: 5 },
];

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const SIMULATED_FAILURE = "Provider error: mailbox creation rejected (simulated)";

function externalId(provider: Provider): string {
  return `${provider === "GOOGLE" ? "google" : "msft"}-${randomUUID()}`;
}

async function seedUsers(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const user of USERS) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    const { id } = await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { email: user.email, name: user.name, role: user.role, passwordHash },
    });
    ids.set(user.email, id);
  }
  return ids;
}

async function seedOrder(order: SeedOrder, customerId: string, now: number): Promise<void> {
  const createdAt = new Date(now - order.daysAgo * DAY);
  const claimedAt = new Date(createdAt.getTime() + MINUTE);
  const finishedAt = new Date(createdAt.getTime() + 2 * MINUTE);
  const processed = order.status !== "PENDING";
  const failed = order.status === "FAILED" ? (order.failedMailboxes ?? 1) : 0;
  const reason = failed > 0 ? `${failed} of ${order.mailboxCount} mailboxes failed` : null;

  // The last `failed` mailboxes failed; the rest follow the order's outcome.
  const addresses = mailboxAddresses(order.domain, order.mailboxCount);
  const mailboxes = addresses.map((address, i) => {
    const isFailed = i >= addresses.length - failed;
    if (!processed) {
      return { address, status: "PENDING" as const, attempts: 0, updatedAt: createdAt };
    }
    return isFailed
      ? { address, status: "FAILED" as const, lastError: SIMULATED_FAILURE, attempts: 1, updatedAt: finishedAt }
      : { address, status: "ACTIVE" as const, externalId: externalId(order.provider), attempts: 1, updatedAt: finishedAt };
  });

  type AuditRow = {
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorType: ActorType;
    actorUserId?: string;
    reason?: string;
    createdAt: Date;
  };
  const auditLogs: AuditRow[] = [
    { fromStatus: null, toStatus: "PENDING", actorType: "CUSTOMER", actorUserId: customerId, createdAt },
  ];
  if (processed) {
    auditLogs.push(
      { fromStatus: "PENDING", toStatus: "PROVISIONING", actorType: "SYSTEM", reason: "Claimed by worker", createdAt: claimedAt },
      {
        fromStatus: "PROVISIONING",
        toStatus: order.status,
        actorType: "SYSTEM",
        reason: reason ?? "All mailboxes provisioned",
        createdAt: finishedAt,
      },
    );
  }

  await prisma.order.create({
    data: {
      customerId,
      idempotencyKey: randomUUID(),
      domain: order.domain,
      provider: order.provider,
      mailboxCount: order.mailboxCount,
      status: order.status,
      attempts: processed ? 1 : 0,
      lastError: reason,
      claimedAt: processed ? claimedAt : null,
      createdAt,
      updatedAt: processed ? finishedAt : createdAt,
      mailboxes: { create: mailboxes },
      auditLogs: { create: auditLogs },
    },
  });
}

async function main(): Promise<void> {
  const userIds = await seedUsers();
  const customerIds = USERS.filter((u) => u.role === "CUSTOMER").map((u) => userIds.get(u.email)!);

  await prisma.order.deleteMany({ where: { customerId: { in: customerIds } } });

  const now = Date.now();
  for (const order of ORDERS) {
    await seedOrder(order, userIds.get(order.customer)!, now);
  }

  console.log(`Seeded ${USERS.length} users and ${ORDERS.length} orders.`);
  for (const user of USERS) console.log(`  ${user.role.padEnd(8)} ${user.email} / ${user.password}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
