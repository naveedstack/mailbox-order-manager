// Worker process entry: `npm run worker`. Run several at once safely; each
// order is claimed by exactly one worker (OrderRepository.claimNextPending).
//
// First SIGINT/SIGTERM: stop claiming, finish the current order, exit 0.
// Second signal: exit immediately (the in-flight order may stay PROVISIONING).
import "dotenv/config"; // must stay first: config and db read process.env on import
import { hostname } from "node:os";
import { createLogger } from "@/lib/logger";
import { providerConfig, workerConfig } from "@/server/config";
import { provisioningService } from "@/server/container";
import { prisma } from "@/server/db";
import { runWorker } from "./loop";

const workerId = `${hostname()}:${process.pid}`;
const logger = createLogger(`worker ${workerId}`);

async function main(): Promise<void> {
  const controller = new AbortController();
  let signalsReceived = 0;

  const onSignal = (signal: NodeJS.Signals) => {
    signalsReceived++;
    if (signalsReceived === 1) {
      logger.info(`${signal}: finishing the current order, then exiting (send again to force)`);
      controller.abort();
    } else {
      logger.warn(`${signal} again: exiting now; an in-flight order may stay PROVISIONING`);
      process.exit(1);
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  logger.info(
    `started: poll ${workerConfig.pollMs}ms, provider failure rate ${providerConfig.failureRate}, ` +
      `delay ${providerConfig.minDelayMs}-${providerConfig.maxDelayMs}ms`,
  );
  await runWorker({
    processNext: () => provisioningService.processNext(),
    pollMs: workerConfig.pollMs,
    signal: controller.signal,
    logger,
  });
  logger.info("stopped");
}

main()
  .catch((error: unknown) => {
    logger.error("crashed", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
