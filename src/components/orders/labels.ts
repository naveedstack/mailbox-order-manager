// Display names for domain enums. Presentation only: values sent to the API
// and kept in URLs stay the enum codes.
import type { MailboxStatus, OrderStatus, Provider } from "@/domain/types";

export const STATUS_LABEL: Record<OrderStatus | MailboxStatus, string> = {
  PENDING: "Pending",
  PROVISIONING: "Provisioning",
  ACTIVE: "Active",
  FAILED: "Failed",
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  GOOGLE: "Google Workspace",
  MICROSOFT: "Microsoft 365",
};
