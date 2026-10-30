import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AuditLogTable } from "@/components/orders/audit-log-table";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { PROVIDER_LABEL } from "@/components/orders/labels";
import { MailboxRack } from "@/components/orders/mailbox-rack";
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
  // Display hint only; the retry API enforces the same rule.
  const canRetry = isAdmin && canTransition(order.status, "PENDING", "ADMIN");

  const facts: [string, ReactNode][] = [
    ["Provider", PROVIDER_LABEL[order.provider]],
    ["Mailboxes", order.mailboxCount],
    ["Attempts", order.attempts],
    ...(isAdmin ? ([["Customer", order.customerEmail]] as [string, ReactNode][]) : []),
    ["Created", formatDateTime(order.createdAt)],
    ["Updated", formatDateTime(order.updatedAt)],
  ];

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <Link
          href={isAdmin ? "/admin/orders" : "/orders"}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          ← {isAdmin ? "All orders" : "My orders"}
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="type-display text-4xl font-semibold break-all sm:text-5xl">{order.domain}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <StatusBadge status={order.status} size="lg" />
              {inFlight && <span className="text-sm text-muted-foreground">Refreshes every few seconds</span>}
            </div>
          </div>
          {canRetry && <RetryButton orderId={order.id} label="Retry failed mailboxes" size="default" />}
        </div>

        {order.status === "FAILED" && order.lastError && (
          <p className="border-l-4 border-status-failed bg-surface px-4 py-2 text-sm">
            {order.lastError}.{" "}
            <span className="text-muted-foreground">
              {isAdmin
                ? "Retrying provisions only the failed mailboxes."
                : "An admin can retry it; active mailboxes are kept."}
            </span>
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-y py-4 text-sm sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-10">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-3">
            <dt className="text-muted-foreground">Order ID</dt>
            <dd className="font-mono text-xs break-all">{order.id}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="mailboxes-heading" className="flex flex-col gap-5">
        <h2 id="mailboxes-heading" className="text-lg font-semibold">
          Mailboxes
        </h2>
        <MailboxRack mailboxes={order.mailboxes} provisioning={order.status === "PROVISIONING"} />
        <MailboxTable mailboxes={order.mailboxes} provisioning={order.status === "PROVISIONING"} />
      </section>

      <section aria-labelledby="audit-heading" className="flex flex-col gap-5">
        <h2 id="audit-heading" className="text-lg font-semibold">
          Audit log
        </h2>
        <AuditLogTable entries={order.auditLog} />
      </section>

      {inFlight && <AutoRefresh />}
    </div>
  );
}
