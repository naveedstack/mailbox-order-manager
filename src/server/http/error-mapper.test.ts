import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";
import { toErrorResponse } from "./error-mapper";

describe("toErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [new ValidationError("bad input"), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError("Order", "abc"), 404, "NOT_FOUND"],
    [new InvalidTransitionError("ACTIVE", "PENDING", "ADMIN"), 409, "INVALID_TRANSITION"],
    [new ConflictError("stale"), 409, "CONFLICT"],
    [
      new ConflictError("reused", { code: "IDEMPOTENCY_KEY_REUSED" }),
      409,
      "IDEMPOTENCY_KEY_REUSED",
    ],
  ])("maps %o to %i %s", (error, status, code) => {
    const response = toErrorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.body.error.message).toBe(error.message);
  });

  it("includes details when the error has them", () => {
    const response = toErrorResponse(new InvalidTransitionError("ACTIVE", "PENDING", "ADMIN"));

    expect(response.body.error.details).toEqual({
      from: "ACTIVE",
      to: "PENDING",
      actorType: "ADMIN",
    });
  });

  it("omits details when the error has none", () => {
    const response = toErrorResponse(new ForbiddenError());

    expect(response.body.error).not.toHaveProperty("details");
  });

  it("maps a ZodError to 400 VALIDATION_ERROR with field errors", () => {
    const result = z.object({ mailboxCount: z.number().max(50) }).safeParse({ mailboxCount: 51 });
    if (result.success) throw new Error("expected parse failure");

    const response = toErrorResponse(result.error);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toMatchObject({
      fieldErrors: { mailboxCount: [expect.any(String)] },
    });
  });

  it("maps unknown errors to 500 without leaking the internal message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = toErrorResponse(new Error("connection string postgres://secret"));

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  });
});
