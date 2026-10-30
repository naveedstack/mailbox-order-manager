// Shared behaviour of the mock vendors: a random delay, then a random failure.
// rng and sleep are injectable so tests are deterministic and instant.
import { setTimeout as delay } from "node:timers/promises";
import type { Provider } from "@/domain/types";
import { ProviderError, type MailboxProvider, type ProvisionRequest } from "./mailbox-provider";

export type MockProviderConfig = {
  failureRate: number; // 0..1, per mailbox call
  minDelayMs: number;
  maxDelayMs: number;
  rng?: () => number; // [0, 1); default Math.random
  sleep?: (ms: number) => Promise<void>;
};

export abstract class MockMailboxProvider implements MailboxProvider {
  abstract readonly name: Provider;
  protected abstract newExternalId(): string;
  protected abstract failureMessage(request: ProvisionRequest): string;

  constructor(private readonly config: MockProviderConfig) {}

  async provisionMailbox(request: ProvisionRequest): Promise<{ externalId: string }> {
    const { failureRate, minDelayMs, maxDelayMs } = this.config;
    const rng = this.config.rng ?? Math.random;
    const sleep = this.config.sleep ?? ((ms: number) => delay(ms));

    // Exactly two rng reads per call, in this order: delay, then failure roll.
    await sleep(Math.round(minDelayMs + rng() * (maxDelayMs - minDelayMs)));
    if (rng() < failureRate) {
      throw new ProviderError(this.name, this.failureMessage(request));
    }
    return { externalId: this.newExternalId() };
  }
}
