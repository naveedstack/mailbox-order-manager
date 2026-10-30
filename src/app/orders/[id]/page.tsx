import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AuditLogTable } from "@/components/orders/audit-log-table";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { MailboxTable } from "@/components/orders/mailbox-table";
import { RetryButton } from "@/components/orders/retry-button";
import { StatusBadge } from "@/components/orders/status-badge";
import { canTransition } from "@/domain/order-state-machine";
import { orderIdParam } from "@/domain/schemas";
import { formatDateTime } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { toActor } from "@/server/auth/session-token";
import { orderService } from "@/server/container";
import { orNotFound } from "@/server/http/page";

// Shared by admins and customers; getOrderDetails decides who may see what
// (another customer's order is a 404).
export default async function OrderDetailPage({ params }: PageProps<"/orders/[id]">) {
  const user = await requireSession();
  const id = orderIdParam.safeParse((await params).id);
  if (!id.success) notFound();

  const order = await orNotFound(orderService.getOrderDetails(toActor(user), id.data));
  const isAdmin = user.role === "ADMIN";
  const inFlight = order.status === "PENDING" || order.status === "PROVISIONING";
  const failedMailboxes = order.mailboxes.filter((m) => m.status === "FAILED").length;

  const facts: [string, ReactNode][] = [
    ["Provider", order.provider],
    ["Mailboxes", `${order.mailboxCount} (${failedMailboxes} failed)`],
    ["Attempts", order.attempts],
    ["Created", formatDateTime(order.createdAt)],
    ["Updated", formatDateTime(order.updatedAt)],
    ...(isAdmin ? ([["Customer", order.customerEmail]] as [string, ReactNode][]) : []),
    ["Last error", order.lastError ?? "—"],
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href={isAdmin ? "/admin/orders" : "/orders"}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to orders
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{order.domain}</h1>
          <StatusBadge status={order.status} />
          {/* Display hint only; the retry API enforces the same rule. */}
          {isAdmin && canTransition(order.status, "PENDING", "ADMIN") && <RetryButton orderId={order.id} />}
          {inFlight && <span className="text-xs text-muted-foreground">Updating automatically…</span>}
        </div>
        <p className="font-mono text-xs text-muted-foreground">{order.id}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Mailboxes</h2>
        <MailboxTable mailboxes={order.mailboxes} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Audit log</h2>
        <AuditLogTable entries={order.auditLog} />
      </section>

      {inFlight && <AutoRefresh />}
    </div>
  );
}
