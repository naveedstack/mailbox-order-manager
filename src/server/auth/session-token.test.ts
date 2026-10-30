import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_TTL_SECONDS, signSession, verifySession } from "./session-token";

const SECRET = "unit-test-secret-that-is-at-least-32-characters-long";
const user = {
  userId: "3f1c9a52-8a3e-4c1b-9a63-1f2d7f6a9b10",
  role: "ADMIN" as const,
  email: "admin@example.com",
};

describe("session tokens", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", SECRET));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("round-trips the session user", async () => {
    const token = await signSession(user);

    await expect(verifySession(token)).resolves.toEqual(user);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession(user);
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: user.userId, role: "ADMIN", email: "evil@example.com" }),
    ).toString("base64url");

    await expect(verifySession(`${header}.${forgedPayload}.${signature}`)).resolves.toBeNull();
    await expect(verifySession("not-a-jwt")).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(user);
    vi.stubEnv("AUTH_SECRET", "another-secret-that-is-also-at-least-32-characters");

    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const token = await signSession(user);

    vi.setSystemTime(new Date(Date.now() + (SESSION_TTL_SECONDS + 1) * 1000));

    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("refuses to sign with a missing or short secret", async () => {
    vi.stubEnv("AUTH_SECRET", "too-short");
    await expect(signSession(user)).rejects.toThrow(/AUTH_SECRET/);

    vi.stubEnv("AUTH_SECRET", "");
    await expect(signSession(user)).rejects.toThrow(/AUTH_SECRET/);
  });
});
