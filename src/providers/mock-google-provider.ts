import { randomBytes } from "node:crypto";
import type { ProvisionRequest } from "./mailbox-provider";
import { MockMailboxProvider } from "./mock-mailbox-provider";

// Exported so the seed writes the same formats as the worker.
export const googleExternalId = () => `gws_${randomBytes(8).toString("hex")}`;
export const googleFailureMessage = (address: string) =>
  `Google Workspace rejected ${address}: domain verification pending (simulated)`;

export class MockGoogleProvider extends MockMailboxProvider {
  readonly name = "GOOGLE";

  protected newExternalId(): string {
    return googleExternalId();
  }

  protected failureMessage(request: ProvisionRequest): string {
    return googleFailureMessage(request.address);
  }
}
