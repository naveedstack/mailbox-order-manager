import { describe, expect, it } from "vitest";
import { createOrderInput, listOrdersQuery, loginInput, orderIdParam, retryInput } from "./schemas";

const KEY = "3f1c9a52-8a3e-4c1b-9a63-1f2d7f6a9b10";
const valid = { domain: "acme.com", provider: "google", mailboxCount: 3, idempotencyKey: KEY };

describe("createOrderInput", () => {
  it("parses a valid payload and normalizes domain and provider", () => {
    const parsed = createOrderInput.parse({ ...valid, domain: "  Acme.COM ", provider: "Google" });

    expect(parsed).toEqual({
      domain: "acme.com",
      provider: "GOOGLE",
      mailboxCount: 3,
      idempotencyKey: KEY,
    });
  });

  it("maps microsoft to MICROSOFT", () => {
    expect(createOrderInput.parse({ ...valid, provider: "microsoft" }).provider).toBe("MICROSOFT");
  });

  it.each([1, 50])("accepts mailboxCount %s", (mailboxCount) => {
    expect(createOrderInput.safeParse({ ...valid, mailboxCount }).success).toBe(true);
  });

  it.each([0, 51, 2.5, "5", null])("rejects mailboxCount %o", (mailboxCount) => {
    expect(createOrderInput.safeParse({ ...valid, mailboxCount }).success).toBe(false);
  });

  it.each(["https://acme.com", "acme", "ac me.com", "", "acme.com/path", "-acme.com"])(
    "rejects domain %o",
    (domain) => {
      expect(createOrderInput.safeParse({ ...valid, domain }).success).toBe(false);
    },
  );

  it("accepts subdomains", () => {
    expect(createOrderInput.parse({ ...valid, domain: "mail.acme.co.uk" }).domain).toBe(
      "mail.acme.co.uk",
    );
  });

  it("rejects an unknown provider", () => {
    expect(createOrderInput.safeParse({ ...valid, provider: "yahoo" }).success).toBe(false);
  });

  it("rejects a non-uuid idempotencyKey", () => {
    expect(createOrderInput.safeParse({ ...valid, idempotencyKey: "abc" }).success).toBe(false);
  });

  it("rejects a missing idempotencyKey", () => {
    expect(createOrderInput.safeParse({ ...valid, idempotencyKey: undefined }).success).toBe(false);
  });
});

describe("orderIdParam", () => {
  it("accepts a uuid and rejects anything else", () => {
    expect(orderIdParam.safeParse(KEY).success).toBe(true);
    expect(orderIdParam.safeParse("not-a-uuid").success).toBe(false);
  });
});

describe("loginInput", () => {
  it("normalizes the email", () => {
    expect(loginInput.parse({ email: "  Admin@Example.COM ", password: "x" })).toEqual({
      email: "admin@example.com",
      password: "x",
    });
  });

  it.each([
    { email: "not-an-email", password: "x" },
    { email: "a@b.co", password: "" },
    { email: "a@b.co" },
  ])("rejects %o", (input) => {
    expect(loginInput.safeParse(input).success).toBe(false);
  });
});

describe("listOrdersQuery (lenient: bad values are dropped, never an error)", () => {
  it("defaults to page 1, no filters", () => {
    expect(listOrdersQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("parses filters case-insensitively and the page number", () => {
    expect(listOrdersQuery.parse({ status: "failed", provider: "Microsoft", page: "3" })).toEqual({
      status: "FAILED",
      provider: "MICROSOFT",
      page: 3,
      pageSize: 20,
    });
  });

  it("drops unknown filters and falls back to page 1 for bad pages", () => {
    expect(listOrdersQuery.parse({ status: "nope", provider: "", page: "abc" })).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(listOrdersQuery.parse({ page: "0" }).page).toBe(1);
    expect(listOrdersQuery.parse({ page: "2.5" }).page).toBe(1);
  });

  it("takes the first value of a repeated param", () => {
    expect(listOrdersQuery.parse({ status: ["ACTIVE", "FAILED"] }).status).toBe("ACTIVE");
  });
});

describe("retryInput", () => {
  it("accepts an empty body and trims the reason", () => {
    expect(retryInput.parse({})).toEqual({});
    expect(retryInput.parse({ reason: "  provider outage fixed " })).toEqual({
      reason: "provider outage fixed",
    });
  });

  it("rejects an overlong reason", () => {
    expect(retryInput.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
});
