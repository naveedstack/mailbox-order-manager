// Order use cases. Orchestrates domain rules and the repository; no Prisma, no
// HTTP. Every method takes the acting user, and authorization is decided here
// (not in routes or pages).
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { mailboxAddresses } from "@/domain/mailbox";
import {
  isSameOrderRequest,
  type Order,
  type OrderDetails,
  type OrderPage,
} from "@/domain/order";
import { assertTransition } from "@/domain/order-state-machine";
import type { CreateOrderInput, ListOrdersQuery } from "@/domain/schemas";
import { actorUserId, type Actor, type OrderStatus } from "@/domain/types";
import type { OrderRepository, TransitionEffects } from "@/repositories/order-repository";

export type OrderService = ReturnType<typeof createOrderService>;

export function createOrderService(deps: { orders: OrderRepository }) {
  const { orders } = deps;

  // The single gate for status changes (the worker claim is the one documented
  // exception, see OrderRepository.claimNextPending). Validates the move
  // against the state machine, then applies it only if nobody changed the
  // order in between.
  async function transition(
    orderId: string,
    to: OrderStatus,
    actor: Actor,
    options: { reason?: string; effects?: TransitionEffects } = {},
  ): Promise<Order> {
    const current = await orders.findById(orderId);
    if (!current) throw new NotFoundError("Order", orderId);

    assertTransition(current.status, to, actor.type);

    const updated = await orders.transition(
      orderId,
      current.status,
      to,
      { actorType: actor.type, actorUserId: actorUserId(actor), reason: options.reason ?? null },
      options.effects,
    );
    if (updated) return updated;

    const latest = await orders.findById(orderId);
    if (!latest) throw new NotFoundError("Order", orderId);
    throw new ConflictError("Order status changed concurrently; reload and try again", {
      details: { expected: current.status, actual: latest.status },
    });
  }

  return {
    transition,

    // Idempotent per (customer, idempotencyKey): a replay returns the original
    // order with created=false. Input must already be parsed by createOrderInput.
    async createOrder(
      actor: Actor,
      input: CreateOrderInput,
    ): Promise<{ order: Order; created: boolean }> {
      if (actor.type !== "CUSTOMER") {
        throw new ForbiddenError("Only customers can place orders");
      }

      const result = await orders.createIdempotent(
        {
          customerId: actor.userId,
          idempotencyKey: input.idempotencyKey,
          domain: input.domain,
          provider: input.provider,
          mailboxCount: input.mailboxCount,
          mailboxAddresses: mailboxAddresses(input.domain, input.mailboxCount),
        },
        { actorType: "CUSTOMER", actorUserId: actor.userId },
      );

      if (!result.created && !isSameOrderRequest(result.order, input)) {
        throw new ConflictError("This idempotency key was already used for a different order", {
          code: "IDEMPOTENCY_KEY_REUSED",
          details: { orderId: result.order.id },
        });
      }
      return result;
    },

    // Customers only ever see their own orders, whatever filters they pass.
    async listOrders(actor: Actor, query: ListOrdersQuery): Promise<OrderPage> {
      if (actor.type === "SYSTEM") throw new ForbiddenError();

      const { page, pageSize } = query;
      const { items, total } = await orders.list(
        {
          customerId: actor.type === "CUSTOMER" ? actor.userId : undefined,
          status: query.status,
          provider: query.provider,
        },
        { page, pageSize },
      );
      return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
    },

    // Another customer's order is reported as not found, so ids can't be probed.
    async getOrderDetails(actor: Actor, orderId: string): Promise<OrderDetails> {
      if (actor.type === "SYSTEM") throw new ForbiddenError();

      const details = await orders.findDetailsById(orderId);
      if (!details || (actor.type === "CUSTOMER" && details.customerId !== actor.userId)) {
        throw new NotFoundError("Order", orderId);
      }
      return details;
    },

    // FAILED -> PENDING, putting FAILED mailboxes back in the queue in the same
    // transaction. The role is checked before the lookup: otherwise a customer
    // could tell existing ids (403) from missing ones (404).
    async retryOrder(actor: Actor, orderId: string, reason?: string): Promise<Order> {
      if (actor.type !== "ADMIN") throw new ForbiddenError("Only admins can retry orders");

      return transition(orderId, "PENDING", actor, {
        reason: reason || "Retried by admin",
        effects: { resetFailedMailboxes: true },
      });
    },
  };
}
