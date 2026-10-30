// Per-mailbox provisioning state. Mailbox status is not order status, so these
// writes don't go through OrderService.transition().
import type { PrismaClient } from "@/generated/prisma/client";
import type { Mailbox } from "@/domain/mailbox";
import { MAILBOX_STATUSES, type MailboxStatus } from "@/domain/types";

export interface MailboxRepository {
  // Everything not yet ACTIVE, so a retried order only re-provisions what failed.
  listNotActive(orderId: string): Promise<Mailbox[]>;
  markActive(id: string, externalId: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  countByStatus(orderId: string): Promise<Record<MailboxStatus, number>>;
}

export function createMailboxRepository(db: PrismaClient): MailboxRepository {
  return {
    listNotActive(orderId) {
      return db.mailbox.findMany({
        where: { orderId, status: { not: "ACTIVE" } },
        orderBy: { address: "asc" },
      });
    },

    async markActive(id, externalId) {
      await db.mailbox.update({
        where: { id },
        data: { status: "ACTIVE", externalId, lastError: null, attempts: { increment: 1 } },
      });
    },

    async markFailed(id, error) {
      await db.mailbox.update({
        where: { id },
        data: { status: "FAILED", lastError: error, attempts: { increment: 1 } },
      });
    },

    async countByStatus(orderId) {
      const groups = await db.mailbox.groupBy({
        by: ["status"],
        where: { orderId },
        _count: { _all: true },
      });
      const counts = Object.fromEntries(MAILBOX_STATUSES.map((s) => [s, 0])) as Record<
        MailboxStatus,
        number
      >;
      for (const group of groups) counts[group.status] = group._count._all;
      return counts;
    },
  };
}
