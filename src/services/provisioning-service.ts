// One unit of worker work: claim the next PENDING order, provision its
// non-ACTIVE mailboxes through the order's provider, then move the order to
// ACTIVE or FAILED. No Prisma, no HTTP; repositories and providers are injected.
import type { Mailbox } from "@/domain/mailbox";
import type { Order } from "@/domain/order";
import type { Actor } from "@/domain/types";
import { mapWithConcurrency } from "@/lib/concurrency";
import { createLogger, type Logger } from "@/lib/logger";
import {
  ProviderError,
  type MailboxProvider,
  type ProviderRegistry,
} from "@/providers/mailbox-provider";
import type { MailboxRepository } from "@/repositories/mailbox-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { OrderService } from "./order-service";

const SYSTEM: Actor = { type: "SYSTEM" };

// Shown to customers, so it must not leak internals; details go to the log.
const INTERNAL_ERROR_MESSAGE = "Internal error during provisioning";

export type ProcessResult = "idle" | "processed";

export function createProvisioningService(deps: {
  orders: OrderRepository;
  mailboxes: MailboxRepository;
  orderService: OrderService;
  providers: ProviderRegistry;
  concurrency?: number;
  logger?: Logger;
}) {
  const { orders, mailboxes, orderService, providers } = deps;
  const concurrency = deps.concurrency ?? 5;
  const logger = deps.logger ?? createLogger("provisioning");

  // Provider failures are expected and recorded on the mailbox. Repository
  // errors are not caught here: they abort the order (see processNext).
  async function provisionMailbox(
    provider: MailboxProvider,
    order: Order,
    mailbox: Mailbox,
  ): Promise<void> {
    let externalId: string;
    try {
      ({ externalId } = await provider.provisionMailbox({
        mailboxId: mailbox.id,
        address: mailbox.address,
        domain: order.domain,
      }));
    } catch (error) {
      if (!(error instanceof ProviderError)) {
        logger.error(`order ${order.id}: provider threw unexpectedly for ${mailbox.address}`, error);
      }
      const message = error instanceof ProviderError ? error.message : "Unexpected provider error";
      await mailboxes.markFailed(mailbox.id, message);
      return;
    }
    await mailboxes.markActive(mailbox.id, externalId);
  }

  return {
    async processNext(): Promise<ProcessResult> {
      const order = await orders.claimNextPending();
      if (!order) return "idle";
      logger.info(
        `claimed order ${order.id} (${order.provider}, ${order.mailboxCount} mailboxes, attempt ${order.attempts})`,
      );

      try {
        const provider = providers.get(order.provider);
        const pending = await mailboxes.listNotActive(order.id);
        await mapWithConcurrency(pending, concurrency, (mailbox) =>
          provisionMailbox(provider, order, mailbox),
        );

        // Decide from the stored state, not from this attempt alone: a retried
        // order may already have ACTIVE mailboxes, and missing rows count as failed.
        const counts = await mailboxes.countByStatus(order.id);
        if (counts.ACTIVE === order.mailboxCount) {
          await orderService.transition(order.id, "ACTIVE", SYSTEM, {
            reason: `All ${order.mailboxCount} mailboxes provisioned`,
            effects: { lastError: null },
          });
          logger.info(`order ${order.id} -> ACTIVE`);
        } else {
          const summary = `${order.mailboxCount - counts.ACTIVE} of ${order.mailboxCount} mailboxes failed`;
          await orderService.transition(order.id, "FAILED", SYSTEM, {
            reason: summary,
            effects: { lastError: summary },
          });
          logger.info(`order ${order.id} -> FAILED (${summary})`);
        }
      } catch (error) {
        logger.error(`order ${order.id}: unexpected error during provisioning`, error);
        // If this throws too (e.g. the database is down), the error reaches the
        // worker loop, which backs off. The order then stays PROVISIONING: the
        // documented stuck-order limitation.
        await orderService.transition(order.id, "FAILED", SYSTEM, {
          reason: "Unexpected error during provisioning",
          effects: { lastError: INTERNAL_ERROR_MESSAGE },
        });
      }
      return "processed";
    },
  };
}
