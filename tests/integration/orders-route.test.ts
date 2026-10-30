// POST /api/orders through the real route handler: session cookie -> zod ->
// OrderService -> error mapper, against real Postgres.
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/orders/route";
import { prisma } from "@/server/db";
import { createTestUser, resetDatabase } from "./setup/db";
import { postRequest, sessionCookie } from "./setup/http";

describe("POST /api/orders", () => {
  let cookie: string;

  beforeEach(async () => {
    await resetDatabase();
    cookie = await sessionCookie(await createTestUser("CUSTOMER"));
  });

  afterAll(() => prisma.$disconnect());

  const body = (overrides: Record<string, unknown> = {}) => ({
    domain: "acme.com",
    provider: "google",
    mailboxCount: 2,
    idempotencyKey: randomUUID(),
    ...overrides,
  });

  it("creates an order: 201 with the order", async () => {
    const res = await POST(postRequest("/api/orders", { body: body(), cookie }));

    expect(res.status).toBe(201);
    const { order } = await res.json();
    expect(order).toMatchObject({ domain: "acme.com", provider: "GOOGLE", status: "PENDING" });
  });

  it("replays the same key and payload: 200 with the same order", async () => {
    const payload = body();

    const first = await (await POST(postRequest("/api/orders", { body: payload, cookie }))).json();
    const res = await POST(postRequest("/api/orders", { body: payload, cookie }));

    expect(res.status).toBe(200);
    expect((await res.json()).order.id).toBe(first.order.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it("rejects the same key with a different payload: 409 IDEMPOTENCY_KEY_REUSED", async () => {
    const payload = body();
    await POST(postRequest("/api/orders", { body: payload, cookie }));

    const res = await POST(
      postRequest("/api/orders", { body: { ...payload, mailboxCount: 5 }, cookie }),
    );

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("requires a session: 401 UNAUTHORIZED", async () => {
    const res = await POST(postRequest("/api/orders", { body: body() }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  it("rejects a tampered session cookie: 401", async () => {
    const res = await POST(postRequest("/api/orders", { body: body(), cookie: `${cookie}x` }));

    expect(res.status).toBe(401);
  });

  it("validates input: 400 VALIDATION_ERROR with field errors", async () => {
    const res = await POST(postRequest("/api/orders", { body: body({ mailboxCount: 51 }), cookie }));

    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details.fieldErrors.mailboxCount).toBeDefined();
  });

  it("rejects malformed JSON: 400 VALIDATION_ERROR", async () => {
    const res = await POST(postRequest("/api/orders", { rawBody: "{not json", cookie }));

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("does not let an admin place orders: 403 FORBIDDEN", async () => {
    const adminCookie = await sessionCookie(await createTestUser("ADMIN"));

    const res = await POST(postRequest("/api/orders", { body: body(), cookie: adminCookie }));

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});
