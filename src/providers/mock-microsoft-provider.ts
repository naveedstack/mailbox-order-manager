import { randomUUID } from "node:crypto";
import type { ProvisionRequest } from "./mailbox-provider";
import { MockMailboxProvider } from "./mock-mailbox-provider";

export class MockMicrosoftProvider extends MockMailboxProvider {
  readonly name = "MICROSOFT";

  protected newExternalId(): string {
    return `m365_${randomUUID()}`;
  }

  protected failureMessage(request: ProvisionRequest): string {
    return `Microsoft 365 throttled the request for ${request.address} (simulated)`;
  }
}
