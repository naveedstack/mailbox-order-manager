import type { MailboxStatus } from "./types";

export type Mailbox = {
  id: string;
  orderId: string;
  address: string;
  status: MailboxStatus;
  externalId: string | null;
  lastError: string | null;
  attempts: number;
  updatedAt: Date;
};

// The mailboxes an order provisions: mailbox-01@<domain> … mailbox-NN@<domain>.
export function mailboxAddresses(domain: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `mailbox-${String(i + 1).padStart(2, "0")}@${domain}`,
  );
}
