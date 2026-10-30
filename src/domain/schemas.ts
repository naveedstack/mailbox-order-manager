// Input schemas shared by route handlers and forms. Parsing also normalizes, so
// services can trust and compare what they receive (e.g. the idempotency check).
import { z } from "zod";
import { PROVIDERS } from "./types";

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
