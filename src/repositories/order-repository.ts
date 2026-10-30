// The only place that knows how orders are stored. Speaks domain types in and
// out; Prisma types and error codes never leave this file.
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type * as db from "@/generated/prisma/enums";
import type { AuditEntry, Order, OrderDetails, OrderListItem } from "@/domain/order";
import type { ActorType, MailboxStatus, OrderStatus, Provider, Role } from "@/domain/types";

// Compile-time guard: the domain unions must match the generated Prisma enums.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type DomainEnumsMatchPrisma = [
  Assert<Same<OrderStatus, db.OrderStatus>>,
  Assert<Same<MailboxStatus, db.MailboxStatus>>,
  Assert<Same<Provider, db.Provider>>,
  Assert<Same<ActorType, db.ActorType>>,
  Assert<Same<Role, db.Role>>,
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

export type OrderListFilter = {
  customerId?: string;
  status?: OrderStatus;
  provider?: Provider;
};

export interface OrderRepository {
  // Creates order + mailboxes + the creation audit row atomically. If the
  // (customerId, idempotencyKey) pair already exists, returns that order instead.
  createIdempotent(data: NewOrder, audit: AuditInput): Promise<{ order: Order; created: boolean }>;
  findById(id: string): Promise<Order | null>;
  // Newest first; `total` counts all matches, for pagination.
  list(
    filter: OrderListFilter,
    page: { page: number; pageSize: number },
  ): Promise<{ items: OrderListItem[]; total: number }>;
  // Order + customer email + mailboxes (by address) + audit log (oldest first).
  findDetailsById(id: string): Promise<OrderDetails | null>;
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
  // Atomically moves the oldest PENDING order to PROVISIONING and writes its
  // audit row. Concurrent callers never get the same order. The one status
  // change that bypasses OrderService.transition() (see CLAUDE.md).
  claimNextPending(): Promise<Order | null>;
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

    async list(filter, { page, pageSize }) {
      // Undefined keys are ignored by Prisma, so absent filters match everything.
      const where = {
        customerId: filter.customerId,
        status: filter.status,
        provider: filter.provider,
      };
      const [rows, total] = await db.$transaction([
        db.order.findMany({
          where,
          // id breaks ties so pages never overlap or skip rows.
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { customer: { select: { email: true } } },
        }),
        db.order.count({ where }),
      ]);
      const items = rows.map(({ customer, ...order }) => ({
        ...order,
        customerEmail: customer.email,
      }));
      return { items, total };
    },

    async findDetailsById(id) {
      const row = await db.order.findUnique({
        where: { id },
        include: {
          customer: { select: { email: true } },
          mailboxes: { orderBy: { address: "asc" } },
          auditLogs: {
            orderBy: { createdAt: "asc" },
            include: { actorUser: { select: { email: true } } },
          },
        },
      });
      if (!row) return null;
      const { customer, mailboxes, auditLogs, ...order } = row;
      const auditLog: AuditEntry[] = auditLogs.map(({ actorUser, ...entry }) => ({
        ...entry,
        actorEmail: actorUser?.email ?? null,
      }));
      return { ...order, customerEmail: customer.email, mailboxes, auditLog };
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

    async claimNextPending() {
      // One statement, so one implicit transaction:
      // - FOR UPDATE SKIP LOCKED: concurrent claimers skip rows another claimer
      //   holds; a row claimed (committed) after our snapshot is re-checked
      //   against status = 'PENDING' and skipped.
      // - Raw SQL bypasses Prisma's client-side defaults: ids come from
      //   gen_random_uuid() and updated_at is set explicitly.
      // - Enum literals are cast: in INSERT ... SELECT an untyped literal is text.
      // - Data-modifying CTEs always run to completion, so the audit row is
      //   written even though the final SELECT doesn't read it.
      // - Columns are aliased to the domain Order shape.
      const rows = await db.$queryRaw<Order[]>`
        WITH next AS (
          SELECT id FROM orders
          WHERE status = 'PENDING'::"OrderStatus"
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        ), claimed AS (
          UPDATE orders o
          SET status = 'PROVISIONING'::"OrderStatus",
              claimed_at = now(),
              updated_at = now(),
              attempts = o.attempts + 1
          FROM next
          WHERE o.id = next.id AND o.status = 'PENDING'::"OrderStatus"
          RETURNING o.*
        ), audit AS (
          INSERT INTO order_audit_logs
            (id, order_id, from_status, to_status, actor_type, reason, created_at)
          SELECT gen_random_uuid(), claimed.id, 'PENDING'::"OrderStatus",
                 'PROVISIONING'::"OrderStatus", 'SYSTEM'::"ActorType", 'Claimed by worker', now()
          FROM claimed
        )
        SELECT id,
               customer_id     AS "customerId",
               idempotency_key AS "idempotencyKey",
               domain,
               provider,
               mailbox_count   AS "mailboxCount",
               status,
               attempts,
               last_error      AS "lastError",
               claimed_at      AS "claimedAt",
               created_at      AS "createdAt",
               updated_at      AS "updatedAt"
        FROM claimed
      `;
      return rows[0] ?? null;
    },
  };
}
