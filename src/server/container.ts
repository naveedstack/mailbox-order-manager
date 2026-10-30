// Composition root: wires repositories, providers and services. Plain
// factories, no DI library. Must stay free of Next.js imports: the worker
// (plain Node via tsx) imports it too.
import { createLogger } from "@/lib/logger";
import { MockGoogleProvider } from "@/providers/mock-google-provider";
import { MockMicrosoftProvider } from "@/providers/mock-microsoft-provider";
import { createProviderRegistry } from "@/providers/mailbox-provider";
import { createMailboxRepository } from "@/repositories/mailbox-repository";
import { createOrderRepository } from "@/repositories/order-repository";
import { createUserRepository } from "@/repositories/user-repository";
import { createAuthService } from "@/services/auth-service";
import { createOrderService } from "@/services/order-service";
import { createProvisioningService } from "@/services/provisioning-service";
import { providerConfig } from "./config";
import { prisma } from "./db";

export const orderRepository = createOrderRepository(prisma);
export const mailboxRepository = createMailboxRepository(prisma);
export const userRepository = createUserRepository(prisma);

export const orderService = createOrderService({ orders: orderRepository });
export const authService = createAuthService({ users: userRepository });

export const providerRegistry = createProviderRegistry([
  new MockGoogleProvider(providerConfig),
  new MockMicrosoftProvider(providerConfig),
]);

export const provisioningService = createProvisioningService({
  orders: orderRepository,
  mailboxes: mailboxRepository,
  orderService,
  providers: providerRegistry,
  // pid tells apart the logs of several workers running side by side.
  logger: createLogger(`provisioning pid=${process.pid}`),
});
