import Link from "next/link";
import type { OrderPage } from "@/domain/order";
import type { ListOrdersQuery } from "@/domain/schemas";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function pageHref(basePath: string, query: ListOrdersQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.provider) params.set("provider", query.provider);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

export function Pagination({
  basePath,
  query,
  page,
}: {
  basePath: string;
  query: ListOrdersQuery;
  page: Pick<OrderPage, "page" | "pageCount" | "total">;
}) {
  const linkClass = buttonVariants({ variant: "outline", size: "sm" });
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav className="flex items-center justify-between gap-4 text-sm text-muted-foreground" aria-label="Pagination">
      <span>
        Page {page.page} of {page.pageCount} · {page.total} {page.total === 1 ? "order" : "orders"}
      </span>
      <span className="flex gap-2">
        <Link
          href={pageHref(basePath, query, page.page - 1)}
          className={cn(linkClass, page.page <= 1 && disabled)}
          aria-disabled={page.page <= 1}
        >
          Previous
        </Link>
        <Link
          href={pageHref(basePath, query, page.page + 1)}
          className={cn(linkClass, page.page >= page.pageCount && disabled)}
          aria-disabled={page.page >= page.pageCount}
        >
          Next
        </Link>
      </span>
    </nav>
  );
}
