import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { Pagination } from "@/components/orders/pagination";
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
  const filtered = Boolean(query.status || query.provider) || query.page > 1;
  const inFlight = page.items.some((o) => o.status === "PENDING" || o.status === "PROVISIONING");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <Link href="/orders/new" className={buttonVariants()}>
          New order
        </Link>
      </div>

      {page.total === 0 && !filtered ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border p-10 text-center">
          <p className="text-muted-foreground">You have no orders yet.</p>
          <Link href="/orders/new" className={buttonVariants({ variant: "outline" })}>
            Create your first order
          </Link>
        </div>
      ) : (
        <>
          <OrderFilters basePath="/orders" query={query} />
          {page.items.length > 0 ? (
            <OrdersTable orders={page.items} />
          ) : (
            <p className="rounded-lg border p-6 text-center text-muted-foreground">No orders match.</p>
          )}
          <Pagination basePath="/orders" query={query} page={page} />
        </>
      )}

      {inFlight && <AutoRefresh />}
    </div>
  );
}
