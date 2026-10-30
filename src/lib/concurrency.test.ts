import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("never has more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 5, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });

    expect(peak).toBe(5);
  });

  it("returns results in input order even when later items finish first", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await tick(ms);
      return ms * 2;
    });

    expect(results).toEqual([60, 20, 40]);
  });

  it("does nothing for an empty list", async () => {
    let calls = 0;

    await expect(mapWithConcurrency([], 5, async () => calls++)).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it("on failure: stops starting new items, waits for in-flight ones, then rejects", async () => {
    const started: number[] = [];
    const finished: number[] = [];

    const run = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (i) => {
      started.push(i);
      if (i === 0) throw new Error("boom");
      await tick(5);
      finished.push(i);
    });

    await expect(run).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]);
    expect(finished).toEqual([1]);
  });

  it("rejects a non-positive limit", async () => {
    await expect(mapWithConcurrency([1], 0, async () => {})).rejects.toThrow(RangeError);
  });
});
