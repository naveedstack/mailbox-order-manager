import { describe, expect, it } from "vitest";
import { failedSummary, mailboxAddresses, mailboxCountLabel, provisionedSummary } from "./mailbox";

describe("mailboxAddresses", () => {
  it("numbers mailboxes from 01 on the order's domain", () => {
    expect(mailboxAddresses("acme.com", 3)).toEqual([
      "mailbox-01@acme.com",
      "mailbox-02@acme.com",
      "mailbox-03@acme.com",
    ]);
  });

  it("produces unique addresses for the maximum order size", () => {
    const addresses = mailboxAddresses("acme.com", 50);

    expect(addresses).toHaveLength(50);
    expect(new Set(addresses).size).toBe(50);
    expect(addresses.at(-1)).toBe("mailbox-50@acme.com");
  });
});

describe("mailbox wording", () => {
  it("uses the singular for one mailbox", () => {
    expect(mailboxCountLabel(1)).toBe("1 mailbox");
    expect(mailboxCountLabel(3)).toBe("3 mailboxes");
  });

  it("summarizes a fully provisioned order", () => {
    expect(provisionedSummary(1)).toBe("1 mailbox provisioned");
    expect(provisionedSummary(3)).toBe("All 3 mailboxes provisioned");
  });

  it("summarizes failures against the order size", () => {
    expect(failedSummary(1, 1)).toBe("1 of 1 mailbox failed");
    expect(failedSummary(2, 3)).toBe("2 of 3 mailboxes failed");
  });
});
