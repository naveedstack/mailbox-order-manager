// The only place that knows how orders are stored. Speaks domain types in and
// out; Prisma types and error codes never leave this file.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type * as db from "@/generated/prisma/enums";
import type { Order } from "@/domain/order";
import type { ActorType, MailboxStatus, OrderStatus, Provider } from "@/domain/types";

// Compile-time guard: the domain unions must match the generated Prisma enums.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type DomainEnumsMatchPrisma = [
  Assert<Same<OrderStatus, db.OrderStatus>>,
  Assert<Same<MailboxStatus, db.MailboxStatus>>,
  Assert<Same<Provider, db.Provider>>,
  Assert<Same<ActorType, db.ActorType>>,
];

export type NewOrder = {
  customerId: string;
  idempotencyKey: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  mailboxAddresses: string[];
};

export type AuditInput = {
  actorType: ActorType;
  actorUserId: string | null;
  reason?: string | null;
};

// Extra writes that must commit together with a status change.
export type TransitionEffects = {
  lastError?: string | null;
  // Retry: FAILED mailboxes go back to PENDING so the worker re-provisions them.
  resetFailedMailboxes?: boolean;
};

export interface OrderRepository {
  // Creates order + mailboxes + the creation audit row atomically. If the
  // (customerId, idempotencyKey) pair already exists, returns that order instead.
  createIdempotent(data: NewOrder, audit: AuditInput): Promise<{ order: Order; created: boolean }>;
  findById(id: string): Promise<Order | null>;
  // Conditional update: only applies if the order is still in `expectedFrom`.
  // Returns null (and writes nothing) if it isn't. Validation of the move itself
  // is the caller's job (OrderService.transition).
  transition(
    id: string,
    expectedFrom: OrderStatus,
    to: OrderStatus,
    audit: AuditInput,
    effects?: TransitionEffects,
  ): Promise<Order | null>;
}

function isUniqueViolation(error: unknown): boolean {
  // Match on the code only: with the pg driver adapter, meta.target has a
  // different shape than with the classic engine.
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function createOrderRepository(db: PrismaClient): OrderRepository {
  return {
    async createIdempotent(data, audit) {
      try {
        // A nested create is a single transaction: all rows or none.
        const order = await db.order.create({
          data: {
            customerId: data.customerId,
            idempotencyKey: data.idempotencyKey,
            domain: data.domain,
            provider: data.provider,
            mailboxCount: data.mailboxCount,
            mailboxes: {
              createMany: { data: data.mailboxAddresses.map((address) => ({ address })) },
            },
            auditLogs: {
              create: {
                fromStatus: null,
                toStatus: "PENDING",
                actorType: audit.actorType,
                actorUserId: audit.actorUserId,
                reason: audit.reason ?? null,
              },
            },
          },
        });
        return { order, created: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Postgres only reports the violation once the winning insert has
        // committed, so the winner is visible here. This read runs outside the
        // failed (rolled back) statement.
        const existing = await db.order.findUnique({
          where: {
            customerId_idempotencyKey: {
              customerId: data.customerId,
              idempotencyKey: data.idempotencyKey,
            },
          },
        });
        // A violation the key can't explain (another unique constraint): don't hide it.
        if (!existing) throw error;
        return { order: existing, created: false };
      }
    },

    findById(id) {
      return db.order.findUnique({ where: { id } });
    },

    transition(id, expectedFrom, to, audit, effects = {}) {
      return db.$transaction(async (tx) => {
        // WHERE status = expectedFrom is the concurrency guard: a concurrent
        // writer waits on the row lock, then re-checks and matches 0 rows.
        const { count } = await tx.order.updateMany({
          where: { id, status: expectedFrom },
          data: {
            status: to,
            ...(effects.lastError !== undefined && { lastError: effects.lastError }),
          },
        });
        if (count === 0) return null;

        await tx.orderAuditLog.create({
          data: {
            orderId: id,
            fromStatus: expectedFrom,
            toStatus: to,
            actorType: audit.actorType,
            actorUserId: audit.actorUserId,
            reason: audit.reason ?? null,
          },
        });

        if (effects.resetFailedMailboxes) {
          await tx.mailbox.updateMany({
            where: { orderId: id, status: "FAILED" },
            data: { status: "PENDING", lastError: null },
          });
        }

        return tx.order.findUniqueOrThrow({ where: { id } });
      });
    },
  };
}
