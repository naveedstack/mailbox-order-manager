// Order use cases. Orchestrates domain rules and the repository; no Prisma, no HTTP.
import { ConflictError, ForbiddenError, NotFoundError } from "@/domain/errors";
import { mailboxAddresses } from "@/domain/mailbox";
import { isSameOrderRequest, type Order } from "@/domain/order";
import { assertTransition } from "@/domain/order-state-machine";
import type { CreateOrderInput } from "@/domain/schemas";
import { actorUserId, type Actor, type OrderStatus } from "@/domain/types";
import type { OrderRepository, TransitionEffects } from "@/repositories/order-repository";

export type OrderService = ReturnType<typeof createOrderService>;

export function createOrderService(deps: { orders: OrderRepository }) {
  const { orders } = deps;

  return {
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

    // The single gate for status changes (the worker claim is the one documented
    // exception, see OrderRepository.claimNextPending). Validates the move
    // against the state machine, then applies it only if nobody changed the
    // order in between.
    async transition(
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
    },
  };
}
