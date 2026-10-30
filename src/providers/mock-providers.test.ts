import { describe, expect, it, vi } from "vitest";
import { createSeededRng } from "@/lib/random";
import { createProviderRegistry, ProviderError } from "./mailbox-provider";
import { MockGoogleProvider } from "./mock-google-provider";
import { MockMicrosoftProvider } from "./mock-microsoft-provider";

// Each call reads the rng exactly twice: first for the delay, then the failure roll.
function scriptedRng(...values: number[]): () => number {
  return () => {
    const value = values.shift();
    if (value === undefined) throw new Error("scripted rng exhausted");
    return value;
  };
}

const request = { mailboxId: "mb-1", address: "mailbox-01@acme.com", domain: "acme.com" };
const base = { failureRate: 0.2, minDelayMs: 1000, maxDelayMs: 3000 };

describe("mock mailbox providers", () => {
  it("succeeds when the roll is above the failure rate, after a delay in range", async () => {
    const sleep = vi.fn(async () => {});
    const provider = new MockGoogleProvider({ ...base, rng: scriptedRng(0.5, 0.9), sleep });

    const result = await provider.provisionMailbox(request);

    expect(result.externalId).toMatch(/^gws_[0-9a-f]{16}$/);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(2000);
  });

  it("throws ProviderError when the roll is below the failure rate", async () => {
    const sleep = vi.fn(async () => {});
    const provider = new MockMicrosoftProvider({ ...base, rng: scriptedRng(0, 0.1), sleep });

    const call = provider.provisionMailbox(request);

    await expect(call).rejects.toBeInstanceOf(ProviderError);
    await expect(call).rejects.toMatchObject({ provider: "MICROSOFT" });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it("treats a roll exactly at the failure rate as success (strict <)", async () => {
    const provider = new MockGoogleProvider({
      ...base,
      rng: scriptedRng(0, 0.2),
      sleep: async () => {},
    });

    await expect(provider.provisionMailbox(request)).resolves.toHaveProperty("externalId");
  });

  it("gives each provider its own name and externalId format", async () => {
    const config = { ...base, failureRate: 0, sleep: async () => {} };
    const google = new MockGoogleProvider(config);
    const microsoft = new MockMicrosoftProvider(config);

    expect(google.name).toBe("GOOGLE");
    expect(microsoft.name).toBe("MICROSOFT");
    expect((await google.provisionMailbox(request)).externalId).toMatch(/^gws_/);
    expect((await microsoft.provisionMailbox(request)).externalId).toMatch(/^m365_/);
  });

  it("fails at roughly the configured rate (seeded, so deterministic)", async () => {
    const provider = new MockGoogleProvider({
      ...base,
      rng: createSeededRng(42),
      sleep: async () => {},
    });
    let failures = 0;
    const calls = 2000;

    for (let i = 0; i < calls; i++) {
      await provider.provisionMailbox(request).catch(() => failures++);
    }

    expect(failures / calls).toBeGreaterThan(0.17);
    expect(failures / calls).toBeLessThan(0.23);
  });
});

describe("provider registry", () => {
  const config = { ...base, sleep: async () => {} };

  it("returns the strategy registered for each provider", () => {
    const google = new MockGoogleProvider(config);
    const microsoft = new MockMicrosoftProvider(config);
    const registry = createProviderRegistry([google, microsoft]);

    expect(registry.get("GOOGLE")).toBe(google);
    expect(registry.get("MICROSOFT")).toBe(microsoft);
  });

  it("throws for a provider with no registered strategy", () => {
    const registry = createProviderRegistry([new MockGoogleProvider(config)]);

    expect(() => registry.get("MICROSOFT")).toThrow(/MICROSOFT/);
  });
});
