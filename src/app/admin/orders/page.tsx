import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/orders/auto-refresh";
import { OrderFilters } from "@/components/orders/order-filters";
import { OrdersTable } from "@/components/orders/orders-table";
import { Pagination } from "@/components/orders/pagination";
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
  const inFlight = page.items.some((o) => o.status === "PENDING" || o.status === "PROVISIONING");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">All orders</h1>
      <OrderFilters basePath="/admin/orders" query={query} />
      {page.items.length > 0 ? (
        <OrdersTable orders={page.items} showCustomer showRetry />
      ) : (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">
          No orders match{page.page > 1 ? " on this page" : ""}.
        </p>
      )}
      <Pagination basePath="/admin/orders" query={query} page={page} />
      {inFlight && <AutoRefresh />}
    </div>
  );
}
