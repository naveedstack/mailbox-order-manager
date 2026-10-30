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

// Wording shared by the worker and the seed, so audit reasons read the same.
export function mailboxCountLabel(count: number): string {
  return `${count} ${count === 1 ? "mailbox" : "mailboxes"}`;
}

export function provisionedSummary(total: number): string {
  return total === 1 ? "1 mailbox provisioned" : `All ${total} mailboxes provisioned`;
}

export function failedSummary(failed: number, total: number): string {
  return `${failed} of ${mailboxCountLabel(total)} failed`;
}
