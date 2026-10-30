// Runtime configuration from env, validated once. Every value has a default so
// the app and worker start without them; an invalid value fails fast with a
// clear message instead of misbehaving later.
import { z } from "zod";

// Treat "" (e.g. `PROVIDER_FAILURE_RATE=` in .env) as unset.
const num = () => z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number());

const schema = z
  .object({
    WORKER_POLL_MS: num().pipe(z.number().int().positive()).default(1000),
    PROVIDER_FAILURE_RATE: num().pipe(z.number().min(0).max(1)).default(0.2),
    PROVIDER_MIN_DELAY_MS: num().pipe(z.number().int().min(0)).default(1000),
    PROVIDER_MAX_DELAY_MS: num().pipe(z.number().int().min(0)).default(3000),
  })
  .refine((env) => env.PROVIDER_MIN_DELAY_MS <= env.PROVIDER_MAX_DELAY_MS, {
    message: "PROVIDER_MIN_DELAY_MS must be <= PROVIDER_MAX_DELAY_MS",
  });

function load() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

const env = load();

export const workerConfig = {
  pollMs: env.WORKER_POLL_MS,
};

export const providerConfig = {
  failureRate: env.PROVIDER_FAILURE_RATE,
  minDelayMs: env.PROVIDER_MIN_DELAY_MS,
  maxDelayMs: env.PROVIDER_MAX_DELAY_MS,
};
