import { randomBytes } from "node:crypto";
import type { ProvisionRequest } from "./mailbox-provider";
import { MockMailboxProvider } from "./mock-mailbox-provider";

export class MockGoogleProvider extends MockMailboxProvider {
  readonly name = "GOOGLE";

  protected newExternalId(): string {
    return `gws_${randomBytes(8).toString("hex")}`;
  }

  protected failureMessage(request: ProvisionRequest): string {
    return `Google Workspace rejected ${request.address}: domain verification pending (simulated)`;
  }
}
