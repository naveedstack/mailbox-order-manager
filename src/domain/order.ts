import type { Mailbox } from "./mailbox";
import type { ActorType, OrderStatus, Provider } from "./types";

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

export type OrderListItem = Order & { customerEmail: string };

export type AuditEntry = {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: ActorType;
  actorUserId: string | null;
  actorEmail: string | null;
  reason: string | null;
  createdAt: Date;
};

export type OrderDetails = OrderListItem & { mailboxes: Mailbox[]; auditLog: AuditEntry[] };

export type OrderPage = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
