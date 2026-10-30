// Input schemas shared by route handlers and forms. Parsing also normalizes, so
// services can trust and compare what they receive (e.g. the idempotency check).
import { z } from "zod";
import { ORDER_STATUSES, PROVIDERS } from "./types";

// Two or more DNS labels and an alphabetic TLD; no scheme, path or spaces.
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const createOrderInput = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(HOSTNAME, "Enter a domain like example.com"),
  // TASK.md speaks of `google` / `microsoft`; accept any casing.
  provider: z.string().trim().toUpperCase().pipe(z.enum(PROVIDERS)),
  mailboxCount: z.number().int().min(1).max(50),
  idempotencyKey: z.uuid(),
});

export type CreateOrderInput = z.infer<typeof createOrderInput>;

// Order ids are Postgres uuids; anything else would make the driver throw.
export const orderIdParam = z.uuid();

export const loginInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export type LoginInput = z.infer<typeof loginInput>;

// Admin/customer list filters from the URL. Lenient on purpose: a bad or stale
// query string should show the unfiltered list, not an error page.
export const ORDERS_PAGE_SIZE = 20;

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const upperCased = (value: unknown) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

export const listOrdersQuery = z
  .object({
    status: z
      .preprocess((v) => upperCased(firstValue(v)), z.enum(ORDER_STATUSES).optional())
      .catch(undefined),
    provider: z
      .preprocess((v) => upperCased(firstValue(v)), z.enum(PROVIDERS).optional())
      .catch(undefined),
    page: z.preprocess(firstValue, z.coerce.number().int().min(1)).catch(1),
  })
  .transform((query) => ({ ...query, pageSize: ORDERS_PAGE_SIZE }));

export type ListOrdersQuery = z.output<typeof listOrdersQuery>;

export const retryInput = z.object({
  reason: z.string().trim().max(500).optional(),
});
