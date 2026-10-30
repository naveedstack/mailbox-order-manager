import { randomUUID } from "node:crypto";
import type { ProvisionRequest } from "./mailbox-provider";
import { MockMailboxProvider } from "./mock-mailbox-provider";

// Exported so the seed writes the same formats as the worker.
export const microsoftExternalId = () => `m365_${randomUUID()}`;
export const microsoftFailureMessage = (address: string) =>
  `Microsoft 365 throttled the request for ${address} (simulated)`;

export class MockMicrosoftProvider extends MockMailboxProvider {
  readonly name = "MICROSOFT";

  protected newExternalId(): string {
    return microsoftExternalId();
  }

  protected failureMessage(request: ProvisionRequest): string {
    return microsoftFailureMessage(request.address);
  }
}
