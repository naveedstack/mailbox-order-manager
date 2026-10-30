// Order list, shared by the admin list and (Phase 4) the customer list.
import Link from "next/link";
import type { OrderListItem } from "@/domain/order";
import { canTransition } from "@/domain/order-state-machine";
import { formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <TableHead>Created</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead>Domain</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead className="text-right">Mailboxes</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Attempts</TableHead>
          <TableHead>Last error</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(order.createdAt)}</TableCell>
            {showCustomer && <TableCell>{order.customerEmail}</TableCell>}
            <TableCell className="font-medium">{order.domain}</TableCell>
            <TableCell>{order.provider}</TableCell>
            <TableCell className="text-right">{order.mailboxCount}</TableCell>
            <TableCell>
              <StatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-right">{order.attempts}</TableCell>
            <TableCell className="max-w-56 truncate text-muted-foreground" title={order.lastError ?? ""}>
              {order.lastError ?? "—"}
            </TableCell>
            <TableCell className="text-right whitespace-nowrap">
              <span className="inline-flex items-center gap-3">
                {/* Display hint only; the API enforces the same rule. */}
                {showRetry && canTransition(order.status, "PENDING", "ADMIN") && (
                  <RetryButton orderId={order.id} />
                )}
                <Link href={`/orders/${order.id}`} className="text-primary underline-offset-4 hover:underline">
                  View
                </Link>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
