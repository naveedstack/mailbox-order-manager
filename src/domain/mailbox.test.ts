import { describe, expect, it } from "vitest";
import { mailboxAddresses } from "./mailbox";

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
