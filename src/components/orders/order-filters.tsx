// Plain GET form: the URL holds the filter state, no client JS needed.
// Submitting drops `page`, so a new filter starts at page 1.
import Link from "next/link";
import type { ListOrdersQuery } from "@/domain/schemas";
import { ORDER_STATUSES, PROVIDERS } from "@/domain/types";
import { Button, buttonVariants } from "@/components/ui/button";

const selectClass =
  "h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function OrderFilters({ basePath, query }: { basePath: string; query: ListOrdersQuery }) {
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select name="status" defaultValue={query.status ?? ""} className={selectClass}>
          <option value="">All</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Provider
        <select name="provider" defaultValue={query.provider ?? ""} className={selectClass}>
          <option value="">All</option>
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm">
        Apply
      </Button>
      <Link href={basePath} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        Reset
      </Link>
    </form>
  );
}
