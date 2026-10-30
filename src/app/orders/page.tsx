import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { Pagination, pageHref } from "@/components/orders/pagination";
import { buttonVariants } from "@/components/ui/button";
import { listOrdersQuery } from "@/domain/schemas";
import { requireSession } from "@/server/auth/session";
import { toActor } from "@/server/auth/session-token";
import { orderService } from "@/server/container";

export default async function MyOrdersPage({ searchParams }: PageProps<"/orders">) {
  const user = await requireSession();
  if (user.role === "ADMIN") redirect("/admin/orders");

  const query = listOrdersQuery.parse(await searchParams);
  // listOrders scopes a customer to their own orders, whatever the query says.
  const page = await orderService.listOrders(toActor(user), query);
  // A page past the end (stale link, hand-edited URL) shows the last page.
  if (page.page > page.pageCount) redirect(pageHref("/orders", query, page.pageCount));
  const filtered = Boolean(query.status || query.provider) || query.page > 1;
  const inFlight = page.items.some((o) => o.status === "PENDING" || o.status === "PROVISIONING");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="type-display text-4xl font-semibold">My orders</h1>
        <Link href="/orders/new" className={buttonVariants()}>
          New order
        </Link>
      </div>

      {page.total === 0 && !filtered ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-surface p-10 text-center">
          <p className="text-muted-foreground">
            No orders yet. Order mailboxes for a domain and they appear here while they are provisioned.
          </p>
          <Link href="/orders/new" className={buttonVariants({ variant: "outline" })}>
            Order mailboxes
          </Link>
        </div>
      ) : (
        <>
          <OrderFilters basePath="/orders" query={query} />
          {page.items.length > 0 ? (
            <OrdersTable orders={page.items} />
          ) : (
            <p className="rounded-lg border bg-surface p-8 text-center text-muted-foreground">
              No orders match these filters.{" "}
              <Link href="/orders" className="text-primary underline-offset-4 hover:underline">
                Show all orders
              </Link>
            </p>
          )}
          <Pagination basePath="/orders" query={query} page={page} />
        </>
      )}

      {inFlight && <AutoRefresh />}
    </div>
  );
}
