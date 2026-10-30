// Filters as plain links: the URL holds the filter state, no client JS needed.
// Each link keeps the other filter and starts again at page 1.
import Link from "next/link";
import type { ListOrdersQuery } from "@/domain/schemas";
import { ORDER_STATUSES, PROVIDERS, type OrderStatus, type Provider } from "@/domain/types";
import { cn } from "@/lib/utils";
import { PROVIDER_LABEL, STATUS_LABEL } from "./labels";
import { pageHref } from "./pagination";

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-surface font-medium text-foreground shadow-[0_0_0_1px_var(--rule)]",
      )}
    >
      {children}
    </Link>
  );
}

export function OrderFilters({ basePath, query }: { basePath: string; query: ListOrdersQuery }) {
  const withStatus = (status?: OrderStatus) => pageHref(basePath, { ...query, status }, 1);
  const withProvider = (provider?: Provider) => pageHref(basePath, { ...query, provider }, 1);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 py-1">
        <FilterLink href={withStatus()} active={!query.status}>
          All
        </FilterLink>
        {ORDER_STATUSES.map((status) => (
          <FilterLink key={status} href={withStatus(status)} active={query.status === status}>
            {STATUS_LABEL[status]}
          </FilterLink>
        ))}
      </nav>
      <nav aria-label="Filter by provider" className="-mx-1 flex gap-1 overflow-x-auto px-1 py-1">
        <FilterLink href={withProvider()} active={!query.provider}>
          All providers
        </FilterLink>
        {PROVIDERS.map((provider) => (
          <FilterLink key={provider} href={withProvider(provider)} active={query.provider === provider}>
            {PROVIDER_LABEL[provider]}
          </FilterLink>
        ))}
      </nav>
    </div>
  );
}
