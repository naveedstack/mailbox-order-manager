import type { OrderStatus, Provider } from "./types";

export type Order = {
  id: string;
  customerId: string;
  idempotencyKey: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  status: OrderStatus;
  attempts: number;
  lastError: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrderRequest = Pick<Order, "domain" | "provider" | "mailboxCount">;

// An idempotency key replayed with a different payload is a client bug, not a
// retry. Inputs are already normalized by createOrderInput.
export function isSameOrderRequest(order: OrderRequest, request: OrderRequest): boolean {
  return (
    order.domain === request.domain &&
    order.provider === request.provider &&
    order.mailboxCount === request.mailboxCount
  );
}
