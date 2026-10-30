import { describe, expect, it } from "vitest";
import { ForbiddenError, InvalidTransitionError } from "@/domain/errors";
import { assertTransition, canTransition } from "./order-state-machine";

// Hard-coded here on purpose (not imported from the table) so the exhaustive
// test checks the table against the spec instead of against itself.
const STATUSES = ["PENDING", "PROVISIONING", "ACTIVE", "FAILED"] as const;
const ACTORS = ["CUSTOMER", "ADMIN", "SYSTEM"] as const;

const ALLOWED = [
  ["PENDING", "PROVISIONING", "SYSTEM"],
  ["PROVISIONING", "ACTIVE", "SYSTEM"],
  ["PROVISIONING", "FAILED", "SYSTEM"],
  ["FAILED", "PENDING", "ADMIN"],
] as const;

const isAllowed = (from: string, to: string, actor: string) =>
  ALLOWED.some(([f, t, a]) => f === from && t === to && a === actor);

const allTriples = STATUSES.flatMap((from) =>
  STATUSES.flatMap((to) => ACTORS.map((actor) => [from, to, actor] as const)),
);

describe("order state machine", () => {
  it.each(ALLOWED)("allows %s -> %s by %s", (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
    expect(() => assertTransition(from, to, actor)).not.toThrow();
  });

  it("allows exactly the 4 specified transitions out of all 48 (from, to, actor) triples", () => {
    const allowed = allTriples.filter(([from, to, actor]) => canTransition(from, to, actor));

    expect(allTriples).toHaveLength(48);
    expect(allowed).toHaveLength(4);
    for (const [from, to, actor] of allTriples) {
      expect(canTransition(from, to, actor), `${from} -> ${to} by ${actor}`).toBe(
        isAllowed(from, to, actor),
      );
    }
  });

  it.each(STATUSES.flatMap((s) => ACTORS.map((a) => [s, a] as const)))(
    "rejects same-state %s -> %s by %s with InvalidTransitionError",
    (status, actor) => {
      expect(() => assertTransition(status, status, actor)).toThrow(InvalidTransitionError);
    },
  );

  it.each(STATUSES.flatMap((to) => ACTORS.map((a) => [to, a] as const)))(
    "treats ACTIVE as terminal: ACTIVE -> %s by %s is rejected",
    (to, actor) => {
      expect(canTransition("ACTIVE", to, actor)).toBe(false);
      expect(() => assertTransition("ACTIVE", to, actor)).toThrow(InvalidTransitionError);
    },
  );

  it("rejects PROVISIONING -> PENDING (no reaper path back to the queue)", () => {
    for (const actor of ACTORS) {
      expect(() => assertTransition("PROVISIONING", "PENDING", actor)).toThrow(
        InvalidTransitionError,
      );
    }
  });

  it.each([
    ["PENDING", "ACTIVE"],
    ["PENDING", "FAILED"],
    ["FAILED", "ACTIVE"],
    ["FAILED", "PROVISIONING"],
  ] as const)("rejects the skip %s -> %s", (from, to) => {
    for (const actor of ACTORS) {
      expect(() => assertTransition(from, to, actor)).toThrow(InvalidTransitionError);
    }
  });

  it.each(["CUSTOMER", "SYSTEM"] as const)(
    "only an admin can retry: FAILED -> PENDING by %s is Forbidden",
    (actor) => {
      expect(() => assertTransition("FAILED", "PENDING", actor)).toThrow(ForbiddenError);
    },
  );

  it.each(["ADMIN", "CUSTOMER"] as const)(
    "worker transitions are system-only: PROVISIONING -> ACTIVE by %s is Forbidden",
    (actor) => {
      expect(() => assertTransition("PROVISIONING", "ACTIVE", actor)).toThrow(ForbiddenError);
    },
  );

  it("InvalidTransitionError carries code and from/to/actorType details", () => {
    let error: unknown;
    try {
      assertTransition("ACTIVE", "PENDING", "ADMIN");
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(error).toMatchObject({
      code: "INVALID_TRANSITION",
      details: { from: "ACTIVE", to: "PENDING", actorType: "ADMIN" },
    });
  });

  // OrderRepository.claimNextPending() performs PENDING -> PROVISIONING in raw
  // SQL, outside OrderService.transition(). This keeps the SQL and table in sync.
  it("allows the worker claim used by claimNextPending(): PENDING -> PROVISIONING by SYSTEM", () => {
    expect(canTransition("PENDING", "PROVISIONING", "SYSTEM")).toBe(true);
  });
});
