import { describe, expect, it, vi } from "vitest";
import type { ProcessResult } from "@/services/provisioning-service";
import { abortableSleep, runWorker, type Sleep } from "./loop";

const silentLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("runWorker", () => {
  it("keeps processing while there is work, then sleeps pollMs when idle", async () => {
    const controller = new AbortController();
    const results: ProcessResult[] = ["processed", "processed", "idle"];
    const processNext = vi.fn(async () => results.shift()!);
    const sleep = vi.fn<Sleep>(async () => controller.abort());

    await runWorker({ processNext, pollMs: 100, signal: controller.signal, sleep });

    expect(processNext).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(100, controller.signal);
  });

  it("stops promptly when aborted while idle", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const started = Date.now();

    await runWorker({
      processNext: async () => "idle",
      pollMs: 60_000,
      signal: controller.signal,
      sleep: abortableSleep,
    });

    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("lets the in-flight order finish on abort and claims nothing more", async () => {
    const controller = new AbortController();
    let finished = false;
    const processNext = vi.fn(async (): Promise<ProcessResult> => {
      controller.abort(); // shutdown requested mid-order
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
      return "processed";
    });

    await runWorker({ processNext, pollMs: 100, signal: controller.signal, sleep: abortableSleep });

    expect(finished).toBe(true);
    expect(processNext).toHaveBeenCalledTimes(1);
  });

  it("logs errors and backs off exponentially, then carries on", async () => {
    const controller = new AbortController();
    const logger = silentLogger();
    let calls = 0;
    const processNext = vi.fn(async (): Promise<ProcessResult> => {
      calls++;
      if (calls <= 2) throw new Error("database unavailable");
      controller.abort();
      return "processed";
    });
    const sleep = vi.fn<Sleep>(async () => {});

    await runWorker({ processNext, pollMs: 100, signal: controller.signal, sleep, logger });

    expect(processNext).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200, 400]);
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("caps the backoff at maxBackoffMs", async () => {
    const controller = new AbortController();
    let calls = 0;
    const sleep = vi.fn<Sleep>(async () => {
      if (++calls === 5) controller.abort();
    });

    await runWorker({
      processNext: async () => {
        throw new Error("down");
      },
      pollMs: 100,
      maxBackoffMs: 500,
      signal: controller.signal,
      sleep,
      logger: silentLogger(),
    });

    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([200, 400, 500, 500, 500]);
  });
});
