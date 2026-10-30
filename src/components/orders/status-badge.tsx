import type { MailboxStatus, OrderStatus } from "@/domain/types";
import { cn } from "@/lib/utils";

const STYLES: Record<OrderStatus | MailboxStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  PROVISIONING: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function StatusBadge({ status }: { status: OrderStatus | MailboxStatus }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", STYLES[status])}>
      {status}
    </span>
  );
}
