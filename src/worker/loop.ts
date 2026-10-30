// The worker's main loop, free of process concerns so it can be unit tested.
// Shutdown is cooperative: once `signal` aborts, no new order is claimed, but
// an in-flight processNext() (one order) is always allowed to finish.
import { setTimeout as delay } from "node:timers/promises";
import { createLogger, type Logger } from "@/lib/logger";
import type { ProcessResult } from "@/services/provisioning-service";

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

// Resolves after `ms`, or as soon as `signal` aborts.
export const abortableSleep: Sleep = async (ms, signal) => {
  try {
    await delay(ms, undefined, { signal });
  } catch (error) {
    if ((error as Error).name !== "AbortError") throw error;
  }
};

export async function runWorker(options: {
  processNext: () => Promise<ProcessResult>;
  pollMs: number;
  signal: AbortSignal;
  sleep?: Sleep;
  logger?: Logger;
  maxBackoffMs?: number;
}): Promise<void> {
  const { processNext, pollMs, signal } = options;
  const sleep = options.sleep ?? abortableSleep;
  const logger = options.logger ?? createLogger("worker");
  const maxBackoffMs = options.maxBackoffMs ?? 30_000;
  let consecutiveFailures = 0;

  while (!signal.aborted) {
    try {
      const result = await processNext();
      consecutiveFailures = 0;
      if (result === "idle") await sleep(pollMs, signal);
    } catch (error) {
      // e.g. the database is unreachable: back off instead of spinning.
      consecutiveFailures++;
      const backoffMs = Math.min(pollMs * 2 ** consecutiveFailures, maxBackoffMs);
      logger.error(
        `processNext failed (${consecutiveFailures} in a row); retrying in ${backoffMs}ms`,
        error,
      );
      await sleep(backoffMs, signal);
    }
  }
}
