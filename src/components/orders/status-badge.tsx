import type { MailboxStatus, OrderStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./labels";

// Status colour lives on the dot and the text; no filled pill, so a column of
// statuses reads as text first and colour second.
export const STATUS_TEXT: Record<OrderStatus | MailboxStatus, string> = {
  PENDING: "text-status-pending",
  PROVISIONING: "text-status-provisioning",
  ACTIVE: "text-status-active",
  FAILED: "text-status-failed",
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: OrderStatus | MailboxStatus;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium whitespace-nowrap",
        size === "lg" ? "text-base" : "text-sm",
        STATUS_TEXT[status],
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0 rounded-full bg-current",
          size === "lg" ? "size-2.5" : "size-2",
          status === "PROVISIONING" && "motion-safe:animate-status-pulse",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
