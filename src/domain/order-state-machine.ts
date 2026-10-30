// The order lifecycle as data: from -> to -> which actors may perform it.
// Pure, no I/O. OrderService.transition() calls assertTransition() before every
// status change; the worker claim (PENDING -> PROVISIONING) is performed in SQL
// by OrderRepository.claimNextPending(), and a unit test keeps it in the table.
import { ForbiddenError, InvalidTransitionError } from "./errors";
import type { ActorType, OrderStatus } from "./types";

type TransitionTable = Readonly<
  Record<OrderStatus, Readonly<Partial<Record<OrderStatus, readonly ActorType[]>>>>
>;

export const TRANSITIONS: TransitionTable = {
  PENDING: { PROVISIONING: ["SYSTEM"] },
  PROVISIONING: { ACTIVE: ["SYSTEM"], FAILED: ["SYSTEM"] },
  ACTIVE: {},
  FAILED: { PENDING: ["ADMIN"] },
};

export function canTransition(from: OrderStatus, to: OrderStatus, actorType: ActorType): boolean {
  return TRANSITIONS[from][to]?.includes(actorType) ?? false;
}

// Throws InvalidTransitionError (409) when the move itself is not in the
// lifecycle, and ForbiddenError (403) when it is but this actor may not make it
// (e.g. a customer retrying a FAILED order).
export function assertTransition(from: OrderStatus, to: OrderStatus, actorType: ActorType): void {
  const allowedActors = TRANSITIONS[from][to];
  if (!allowedActors) {
    throw new InvalidTransitionError(from, to, actorType);
  }
  if (!allowedActors.includes(actorType)) {
    throw new ForbiddenError(`${actorType} may not move an order from ${from} to ${to}`);
  }
}
