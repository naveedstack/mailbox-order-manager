// Composition root: wires repositories into services. Plain factories, no DI library.
import { createOrderRepository } from "@/repositories/order-repository";
import { createOrderService } from "@/services/order-service";
import { prisma } from "./db";

export const orderRepository = createOrderRepository(prisma);
export const orderService = createOrderService({ orders: orderRepository });
