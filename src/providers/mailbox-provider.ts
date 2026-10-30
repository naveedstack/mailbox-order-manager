// Strategy pattern: one MailboxProvider per vendor, chosen at runtime by the
// order's provider via the registry. The worker only knows this interface.
import type { Provider } from "@/domain/types";

export type ProvisionRequest = {
  // Stable per mailbox. A real provider would get it as an idempotency key,
  // because calls are at-least-once (a crash after success means a re-call).
  mailboxId: string;
  address: string;
  domain: string;
};

export interface MailboxProvider {
  readonly name: Provider;
  // Resolves with the vendor's id for the mailbox; throws ProviderError on failure.
  provisionMailbox(request: ProvisionRequest): Promise<{ externalId: string }>;
}

// An expected, vendor-reported failure. Not an AppError: it never reaches HTTP,
// it becomes the mailbox's lastError.
export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ProviderRegistry {
  get(provider: Provider): MailboxProvider;
}

export function createProviderRegistry(providers: readonly MailboxProvider[]): ProviderRegistry {
  const byName = new Map(providers.map((p) => [p.name, p]));
  return {
    get(provider) {
      const strategy = byName.get(provider);
      if (!strategy) throw new Error(`No mailbox provider registered for ${provider}`);
      return strategy;
    },
  };
}
