import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNextPath } from "@/lib/safe-next-path";
import { proxy } from "./proxy";
import { SESSION_COOKIE, signSession } from "./server/auth/session-token";

const ADMIN = { userId: "3f1c9a52-8a3e-4c1b-9a63-1f2d7f6a9b10", role: "ADMIN" as const, email: "a@x.io" };
const CUSTOMER = { ...ADMIN, role: "CUSTOMER" as const, email: "c@x.io" };

async function request(path: string, user?: typeof ADMIN | typeof CUSTOMER) {
  const headers = new Headers();
  if (user) headers.set("cookie", `${SESSION_COOKIE}=${await signSession(user)}`);
  return new NextRequest(`http://localhost${path}`, { headers });
}

const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy (optimistic gate; services still enforce access)", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "unit-test-secret-that-is-at-least-32-characters-long"));
  afterEach(() => vi.unstubAllEnvs());

  it("redirects anonymous page visits to /login, remembering where they were going", async () => {
    const res = await proxy(await request("/admin/orders?status=FAILED"));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin/orders?status=FAILED");
  });

  it("answers anonymous API calls with a 401 in the API error shape", async () => {
    const res = await proxy(await request("/api/orders"));

    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("keeps customers out of the admin area", async () => {
    const page = await proxy(await request("/admin/orders", CUSTOMER));
    const api = await proxy(await request("/api/admin/orders/x/retry", CUSTOMER));

    expect(new URL(page.headers.get("location")!).pathname).toBe("/orders");
    expect(api.status).toBe(403);
    expect((await api.json()).error.code).toBe("FORBIDDEN");
  });

  it("lets admins through to the admin area", async () => {
    expect(passesThrough(await proxy(await request("/admin/orders", ADMIN)))).toBe(true);
  });

  it("leaves the login page and login/logout APIs public", async () => {
    expect(passesThrough(await proxy(await request("/login")))).toBe(true);
    expect(passesThrough(await proxy(await request("/api/auth/login")))).toBe(true);
    expect(passesThrough(await proxy(await request("/api/auth/logout")))).toBe(true);
  });

  it("sends signed-in users away from the login page", async () => {
    const res = await proxy(await request("/login", ADMIN));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("treats a tampered cookie as anonymous", async () => {
    const req = new NextRequest("http://localhost/api/orders", {
      headers: { cookie: `${SESSION_COOKIE}=not.a.jwt` },
    });

    expect((await proxy(req)).status).toBe(401);
  });
});

describe("safeNextPath (open-redirect guard for ?next=)", () => {
  it.each([
    ["/admin/orders?status=FAILED", "/admin/orders?status=FAILED"],
    ["/orders/123", "/orders/123"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    [null, "/"],
    ["", "/"],
  ])("%o -> %o", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
