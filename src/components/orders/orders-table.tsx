// Order list, shared by the admin list and the customer list.
import Link from "next/link";
import type { OrderListItem } from "@/domain/order";
import { canTransition } from "@/domain/order-state-machine";
import { formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROVIDER_LABEL } from "./labels";
import { RetryButton } from "./retry-button";
import { StatusBadge } from "./status-badge";

export function OrdersTable({
  orders,
  showCustomer = false,
  showRetry = false,
}: {
  orders: OrderListItem[];
  showCustomer?: boolean;
  showRetry?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{showCustomer ? "Domain and customer" : "Domain"}</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead className="text-right">Mailboxes</TableHead>
          <TableHead className="text-right">Attempts</TableHead>
          <TableHead>Last error</TableHead>
          <TableHead>Created</TableHead>
          {showRetry && (
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="py-2.5">
              <Link
                href={`/orders/${order.id}`}
                className="font-medium whitespace-nowrap text-primary underline-offset-4 outline-none hover:underline focus-visible:underline"
              >
                {order.domain}
              </Link>
              {showCustomer && <div className="text-xs text-muted-foreground">{order.customerEmail}</div>}
            </TableCell>
            <TableCell>
              <StatusBadge status={order.status} />
            </TableCell>
            <TableCell className="whitespace-nowrap">{PROVIDER_LABEL[order.provider]}</TableCell>
            <TableCell className="text-right tabular-nums">{order.mailboxCount}</TableCell>
            <TableCell className="text-right tabular-nums">{order.attempts}</TableCell>
            <TableCell className="max-w-56 truncate text-muted-foreground" title={order.lastError ?? ""}>
              {order.lastError ?? "—"}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
              {formatDateTime(order.createdAt)}
            </TableCell>
            {showRetry && (
              <TableCell className="text-right whitespace-nowrap">
                {/* Display hint only; the API enforces the same rule. */}
                {canTransition(order.status, "PENDING", "ADMIN") && <RetryButton orderId={order.id} />}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
