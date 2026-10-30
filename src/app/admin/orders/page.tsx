import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { Pagination, pageHref } from "@/components/orders/pagination";
import { listOrdersQuery } from "@/domain/schemas";
import { requireSession } from "@/server/auth/session";
import { toActor } from "@/server/auth/session-token";
import { orderService } from "@/server/container";

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const user = await requireSession();
  // UX only: listOrders would scope a customer to their own orders anyway.
  if (user.role !== "ADMIN") redirect("/orders");

  const query = listOrdersQuery.parse(await searchParams);
  const page = await orderService.listOrders(toActor(user), query);
  // A page past the end (stale link, hand-edited URL) shows the last page.
  if (page.page > page.pageCount) redirect(pageHref("/admin/orders", query, page.pageCount));
  const inFlight = page.items.some((o) => o.status === "PENDING" || o.status === "PROVISIONING");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-display text-4xl font-semibold">All orders</h1>
      <OrderFilters basePath="/admin/orders" query={query} />
      {page.items.length > 0 ? (
        <OrdersTable orders={page.items} showCustomer showRetry />
      ) : (
        <p className="rounded-lg border bg-surface p-8 text-center text-muted-foreground">
          No orders match these filters.{" "}
          <Link href="/admin/orders" className="text-primary underline-offset-4 hover:underline">
            Show all orders
          </Link>
        </p>
      )}
      <Pagination basePath="/admin/orders" query={query} page={page} />
      {inFlight && <AutoRefresh />}
    </div>
  );
}
