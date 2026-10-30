// Domain vocabulary as plain TS unions. Kept free of Prisma imports; the
// repository asserts at compile time that these match the generated enums.

export const ORDER_STATUSES = ["PENDING", "PROVISIONING", "ACTIVE", "FAILED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MAILBOX_STATUSES = ["PENDING", "ACTIVE", "FAILED"] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const PROVIDERS = ["GOOGLE", "MICROSOFT"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const ROLES = ["CUSTOMER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ACTOR_TYPES = ["CUSTOMER", "ADMIN", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

// Who is performing an action. People carry their user id; the worker doesn't.
export type Actor = { type: "CUSTOMER" | "ADMIN"; userId: string } | { type: "SYSTEM" };

// A signed-in person, as carried in the session.
export type AuthUser = { userId: string; role: Role; email: string };

export function actorUserId(actor: Actor): string | null {
  return actor.type === "SYSTEM" ? null : actor.userId;
}
