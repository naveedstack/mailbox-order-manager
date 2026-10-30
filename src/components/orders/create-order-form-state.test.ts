import { describe, expect, it } from "vitest";
import { describeApiError, parseCreateOrderForm } from "./create-order-form-state";

const KEY = "3f1c9a52-8a3e-4c1b-9a63-1f2d7f6a9b10";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}

const valid = { domain: "Acme.com", provider: "google", mailboxCount: "3" };

describe("parseCreateOrderForm", () => {
  it("turns form strings into the typed, normalized API input with the key attached", () => {
    expect(parseCreateOrderForm(form(valid), KEY)).toEqual({
      ok: true,
      input: { domain: "acme.com", provider: "GOOGLE", mailboxCount: 3, idempotencyKey: KEY },
    });
  });

  it.each(["", "abc", "0", "51", "2.5"])("reports mailboxCount %o as a field error", (mailboxCount) => {
    const result = parseCreateOrderForm(form({ ...valid, mailboxCount }), KEY);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors.mailboxCount).toEqual([
      "Enter a whole number from 1 to 50",
    ]);
  });

  it("reports an invalid domain as a field error", () => {
    const result = parseCreateOrderForm(form({ ...valid, domain: "https://acme.com" }), KEY);

    expect(!result.ok && result.fieldErrors.domain?.length).toBeGreaterThan(0);
  });

  it("reports a missing provider", () => {
    const result = parseCreateOrderForm(
      form({ domain: valid.domain, mailboxCount: valid.mailboxCount }),
      KEY,
    );

    expect(!result.ok && result.fieldErrors.provider?.length).toBeGreaterThan(0);
  });
});

describe("describeApiError", () => {
  it("maps a 400 VALIDATION_ERROR to inline field errors", () => {
    const body = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        details: { formErrors: [], fieldErrors: { mailboxCount: ["Too big"] } },
      },
    };

    expect(describeApiError(400, body)).toEqual({ fieldErrors: { mailboxCount: ["Too big"] } });
  });

  it("shows a 400 without field errors (e.g. malformed JSON) as a form error", () => {
    const body = { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON" } };

    expect(describeApiError(400, body)).toEqual({ formError: "Request body must be valid JSON" });
  });

  it("explains a reused idempotency key and points at the existing order", () => {
    const body = {
      error: {
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "This idempotency key was already used for a different order",
        details: { orderId: "o-1" },
      },
    };

    expect(describeApiError(409, body)).toEqual({
      formError: expect.stringContaining("already submitted"),
      existingOrderId: "o-1",
    });
  });

  it("flags 401 so the form can send the user to login", () => {
    expect(describeApiError(401, { error: { code: "UNAUTHORIZED", message: "x" } })).toEqual({
      unauthorized: true,
    });
  });

  it("falls back to a generic message for unexpected responses", () => {
    expect(describeApiError(500, null)).toEqual({
      formError: "Something went wrong. Please try again.",
    });
    expect(describeApiError(403, { error: { code: "FORBIDDEN", message: "Only customers can place orders" } })).toEqual({
      formError: "Only customers can place orders",
    });
  });
});
