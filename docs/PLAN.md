# Mailbox Order Manager: Implementation Plan

## Context
Take-home task (TASK.md): a Next.js + Postgres internal tool with idempotent order creation, a strict order state machine with audit log, a safe background worker that uses mocked Google/Microsoft providers, admin and customer screens, tests, and docs. Hard cap of 3–4h, built in TASK.md's priority order. Reviewers weight correctness (idempotency, safe worker), layering, and visible review of AI output.

**What's already in the repo:** Next **16.4.3** (middleware is now `proxy.ts`; `cacheComponents: true` is set in `next.config.ts`), Prisma **7.10.1** with `@prisma/adapter-pg` (client is generated to `src/generated/prisma`, and the URL lives in `prisma.config.ts`), the `prisma` singleton in `src/server/db.ts` (reuse it), zod 4.6, vitest with the `@` alias, tsx, docker-compose (Postgres 16 on host port 5433), and the shadcn `button`. jose and bcrypt are **not** installed. The folder is **not a git repo yet**.

---

## Problems in the design decisions (review these first)

1. **The P2002 catch has to live in the repository, and it has to run outside the failed transaction.** Services can't see Prisma error codes (CLAUDE.md rule), so the method is `OrderRepository.createIdempotent()` and it returns `{ order, created }`. Order + mailboxes + creation audit row are created in one `$transaction`. A unique violation aborts that Postgres transaction, so the "fetch the existing order" read has to happen *after* the rollback, not inside it. With the pg driver adapter, P2002's `meta.target` shape differs from the classic engine, so match on `code === 'P2002'` only.
2. **Same key with a different payload.** If the domain, provider or count differs from the stored order, return `409 ConflictError (IDEMPOTENCY_KEY_REUSED)` and don't silently return the old order. This costs one comparison.
3. **"Admin retry only" is a rule about who acts, not just about the from/to pair.** If the actor isn't in the table, the role check ends up ad hoc in the service. Make the table `from → to → allowedActors` (`SYSTEM` for worker transitions, `ADMIN` for retry) and the signature `assertTransition(from, to, actorType)`. It stays pure and fully unit-testable.
4. **CLAUDE.md contradicts itself.** It says "every status change goes through `OrderService.transition()`", but the claim is raw SQL in `claimNextPending()`. Name the claim as the single documented exception, and add a unit test that asserts `PENDING→PROVISIONING` by `SYSTEM` is allowed by the table, so the SQL and the table can't drift apart. Update the CLAUDE.md wording.
5. **The claim plus its audit row can be one statement.** A CTE does it: `WITH claimed AS (UPDATE … RETURNING …), _ AS (INSERT INTO order_audit_logs … SELECT FROM claimed) SELECT * FROM claimed`. That makes it atomic without an interactive transaction. Also:
   - Repeat `AND status='PENDING'` in the outer WHERE.
   - Cast enums (`'PROVISIONING'::"OrderStatus"`).
   - Use the real `@@map` table and column names in the SQL.
   - Map the snake_case result back to the domain type in the repo.
6. **20% failure per mailbox makes big orders fail almost every time.** A 50-mailbox order succeeds with probability 0.8⁵⁰ ≈ 0.001%. Run sequentially at 1–3s per call, it also takes 50–150s. Mitigations:
   - Call the provider per mailbox with **bounded concurrency** (e.g. 5).
   - Make `PROVIDER_FAILURE_RATE` and the delay configurable by env.
   - Rely on "retry only re-provisions non-ACTIVE mailboxes" so orders converge over retries, and say so in the README.
   - For the demo video, use small orders (1–3 mailboxes).
7. **Stuck PROVISIONING.** I agree with documenting it rather than building a fix, with two cheap additions:
   - Add a `claimedAt` column now, so a future lease is a small follow-up.
   - Handle SIGINT/SIGTERM gracefully: stop claiming and finish the current order, so the demo doesn't leave stuck orders.

   Note in the README that a naive reaper (PROVISIONING→PENDING after a timeout) would break "never process twice" unless the final transition is fenced on a claim token.
8. **Next 16 specifics:**
   - Route protection is `src/proxy.ts`, not `middleware.ts`. It is only an optimistic check, and the services enforce access.
   - With `cacheComponents: true`, reading `cookies()` outside `<Suspense>` errors. **Recommendation:** remove `cacheComponents` and `partialPrefetching` from `next.config.ts`. This is a fully dynamic, authenticated app and the flag adds risk without benefit.
9. **Use `bcryptjs`, not `bcrypt`.** Native `bcrypt` needs install scripts, and `package.json` already uses an `allowScripts` allowlist, so it risks failing on a clean clone.
10. **Customers asking for another customer's order get `NotFoundError`, not `ForbiddenError`.** This avoids leaking whether the order exists. `ForbiddenError` is for role violations, like a customer calling retry.
11. **Generate the idempotency key in a client component** (`useState(() => crypto.randomUUID())`), not in a Server Component, because randomness in RSC conflicts with caching. After a successful create, redirect to the detail page so "create another" mounts a fresh key.
12. **The integration tests need their own DB.** The `docker-entrypoint-initdb.d` scripts only run on a fresh volume, so use a vitest `globalSetup` instead: `CREATE DATABASE mailbox_orders_test` if it's missing, then `prisma migrate deploy` with `DATABASE_URL` overridden, then truncate between tests.
13. **Repo hygiene:** `git init` before the first commit. Keep the task PDF out of the repo.

---

## Prisma schema (design)

```prisma
enum Role          { CUSTOMER ADMIN }
enum Provider      { GOOGLE MICROSOFT }
enum OrderStatus   { PENDING PROVISIONING ACTIVE FAILED }
enum MailboxStatus { PENDING ACTIVE FAILED }
enum ActorType     { CUSTOMER ADMIN SYSTEM }

model User {          // @@map("users")
  id uuid pk, email unique, name, passwordHash, role Role, createdAt
  orders Order[]
}

model Order {         // @@map("orders"), snake_case @map on columns
  id uuid pk, customerId -> User, idempotencyKey @db.Uuid,
  domain, provider Provider, mailboxCount Int,
  status OrderStatus @default(PENDING),
  attempts Int @default(0), lastError String?, claimedAt DateTime?,
  createdAt, updatedAt
  mailboxes Mailbox[], auditLogs OrderAuditLog[]
  @@unique([customerId, idempotencyKey])
  @@index([status, createdAt])        // worker claim + admin filter
  @@index([customerId, createdAt])    // customer list
}

model Mailbox {       // @@map("mailboxes")
  id uuid pk, orderId -> Order (onDelete: Cascade),
  address String,                      // e.g. mailbox-01@<domain>
  status MailboxStatus @default(PENDING),
  externalId String?, lastError String?, attempts Int @default(0), updatedAt
  @@unique([orderId, address])
}

model OrderAuditLog { // @@map("order_audit_logs")
  id uuid pk, orderId -> Order,
  fromStatus OrderStatus?,             // null = creation row
  toStatus OrderStatus,
  actorType ActorType, actorUserId -> User?,
  reason String?, createdAt
  @@index([orderId, createdAt])
}
```

Seed: `admin@example.com` and 2 customers (bcryptjs hashes), plus a few orders in mixed states with matching audit rows so the admin list has data to filter.

---

## Folder structure (`src/`)

```
domain/            pure TS, no Prisma
  order-state-machine.ts   transition table + assertTransition(from,to,actorType)
  errors.ts                AppError + ValidationError/NotFoundError/ForbiddenError/
                           InvalidTransitionError/ConflictError/UnauthorizedError
  types.ts                 Actor {userId, role}, OrderStatus/Provider re-exports as TS unions
  schemas.ts               zod: createOrderInput, listOrdersQuery, loginInput, retryInput
repositories/      only Prisma users
  order-repository.ts, mailbox-repository.ts, user-repository.ts
services/
  order-service.ts, provisioning-service.ts, auth-service.ts
providers/
  mailbox-provider.ts (interface), mock-provider-base.ts,
  mock-google-provider.ts, mock-microsoft-provider.ts, registry.ts
server/
  db.ts (exists), container.ts (composition root, wires repos→services),
  auth/session.ts (jose sign/verify, getSession, requireSession),
  http/error-mapper.ts (toErrorResponse → {status, body})
worker/
  index.ts (process entry: signals, loop), loop.ts (runWorker, testable)
proxy.ts           optimistic redirect to /login if no valid cookie
app/
  login/page.tsx, api/auth/login/route.ts, api/auth/logout/route.ts
  orders/page.tsx, orders/new/page.tsx (+ client form), orders/[id]/page.tsx
  admin/orders/page.tsx (+ client RetryButton)
  api/orders/route.ts (POST), api/admin/orders/[id]/retry/route.ts (POST)
components/        order-status-badge, audit-log-table, mailbox-table, pagination, filters
tests/integration/ create-order.test.ts, claim-concurrency.test.ts, setup/global-setup.ts
```

**Mutations go through route handlers. Reads go through Server Components that call services.** Route handlers make the `{ error: { code, message, details? } }` + HTTP status contract real and testable. Pages map `NotFoundError → notFound()` and `UnauthorizedError → redirect('/login')`.

---

## Interfaces (signatures only)

**OrderRepository**
- `createIdempotent(data: NewOrder, audit: AuditInput) → { order, created }`. Creates order + mailboxes + the `null→PENDING` audit row in one transaction. On P2002 it runs `findByKey` after the rollback.
- `findById(id) → OrderWithDetails | null` (with mailboxes and audit log ordered by `createdAt`)
- `list(filter: {customerId?, status?, provider?}, page: {page, pageSize}) → { items, total }`
- `transition(id, expectedFrom, to, audit, patch?) → boolean`. Runs `updateMany where {id, status: expectedFrom}`, and only if `count===1` inserts the audit row, all in one `$transaction`. `patch` covers `lastError` and incrementing `attempts`.
- `claimNextPending() → Order | null`. This is the CTE claim (SKIP LOCKED + `claimedAt=now()` + audit row in a single statement).

**MailboxRepository:** `listNotActive(orderId)`, `markActive(id, externalId)`, `markFailed(id, error)`

**UserRepository:** `findByEmail(email)`, `findById(id)`

**OrderService** (deps injected through a factory)
- `createOrder(actor, input)`: customer only, zod-validated upstream; payload-mismatch check → `ConflictError`
- `getOrder(actor, id)`: ownership check → `NotFoundError`
- `listOrders(actor, query)`: customers are forced to their own `customerId`; admins can filter freely
- `retryOrder(actor, id, reason?)` → `transition(id, 'PENDING', actor, reason)`
- `transition(id, to, actor, reason?, patch?)`: **the single gate**. It reads the current status, calls `assertTransition`, then `repo.transition`. When that returns false it re-reads: the order is gone → `NotFoundError`; otherwise → `ConflictError`.

**MailboxProvider:** `readonly name: Provider`, `provisionMailbox({ address, domain }) → Promise<{ externalId }>`, which throws `ProviderError` on failure. Mocks take `{ rng: () => number, sleep: (ms) => Promise<void>, failureRate, minDelayMs, maxDelayMs }`. `ProviderRegistry.get(provider)` throws on an unknown provider.

**ProvisioningService:** `processNext() → 'idle' | 'processed'`
1. `claimNextPending()`, or return `'idle'`
2. `listNotActive`
3. Provision with a concurrency limit of 5, marking each mailbox active or failed
4. If every mailbox is ACTIVE → `transition(ACTIVE, SYSTEM)`. Otherwise → `transition(FAILED, SYSTEM, reason "n of m mailboxes failed", patch lastError)`. An unexpected exception tries `transition(FAILED)` and logs.

**AuthService:** `login(email, password) → SessionPayload` (bcryptjs compare; same error for an unknown user and a wrong password). `session.ts` signs an HS256 JWT `{sub, role}` with `AUTH_SECRET` into an httpOnly, SameSite=Lax cookie that expires in 8h.

**Error mapper:**

| Error | Status | Code |
|---|---|---|
| `ValidationError`, `ZodError` | 400 | `VALIDATION_ERROR` (`details` = flattened issues) |
| `UnauthorizedError` | 401 | |
| `ForbiddenError` | 403 | |
| `NotFoundError` | 404 | |
| `InvalidTransitionError` | 409 | `INVALID_TRANSITION` |
| `ConflictError` | 409 | `CONFLICT` |
| Anything unknown | 500 | `INTERNAL_ERROR` (generic message, logged server-side) |

## Worker loop
`npm run worker` → `tsx src/worker/index.ts`. Env: `WORKER_POLL_MS=1000`.
1. Loop while not stopping: run `processNext()`. If idle, sleep `POLL_MS`, and the sleep is interruptible by shutdown. Errors are logged, the loop backs off and continues.
2. SIGINT/SIGTERM sets `stopping = true`. The current order finishes, then `prisma.$disconnect()` runs.
3. One order per process at a time. To demo safety, run two workers in two terminals: the SKIP LOCKED claim keeps their order sets disjoint.

---

## Phases (priority order, ~3h45m budget)

| # | Phase | Deliverables | Budget |
|---|---|---|---|
| 0 | Foundations | `git init`; add jose, bcryptjs; remove cacheComponents; schema + first migration; `domain/errors.ts`; error mapper; `container.ts`; `.env.example` gets `AUTH_SECRET`, `PROVIDER_FAILURE_RATE`, `WORKER_POLL_MS`; `db:seed` script + `prisma.config.ts` seed | 25m |
| 1 | Order creation + state machine | **TDD** the state machine; OrderRepository (createIdempotent, transition); OrderService (createOrder, transition); `POST /api/orders`; integration test for creation. Services take an `Actor`, so no auth is needed yet | 50m |
| 2 | Provider + worker | Provider interface, mocks, registry (unit tests with a seeded RNG); `claimNextPending` CTE + concurrency test; ProvisioningService; worker loop + signals | 45m |
| 3 | Auth + admin | session.ts, AuthService, login/logout routes, `proxy.ts`, seed users; admin list with zod-parsed `searchParams` (status, provider, page), retry route + button, detail page with mailbox and audit tables | 45m |
| 4 | Customer views | Orders list, create form (client key + zod), detail page reused from phase 3 with an ownership check | 25m |
| 5 | Tests sweep | Fill the gaps in the test list below; `npm run typecheck && npm test` green | 15m |
| 6 | Docs + video | README (clean-clone steps, logins, limitations), `docs/ARCHITECTURE.md`, `docs/AI_WORKLOG.md` (keep notes as you go, especially where Claude was wrong), demo video | 25m |

Commit after each green step with the conventional-commit skill. Expect about 15–25 commits.

## Test list

**Unit (pure, no DB)**
- **State machine:** table-driven over all 16 from/to pairs × actor types. Only the 4 allowed pairs pass with the right actor; same-state transitions are rejected; a customer can't retry; `InvalidTransitionError` carries `from`/`to` in `details`; the claim transition is allowed for SYSTEM (guards the SQL/table drift from problem 4).
- **Mock providers:** `rng` below `failureRate` → throws `ProviderError`; above it → returns an `externalId`; the delay stays in `[min, max]` (injected `sleep` spy); the registry returns the right strategy and throws on an unknown provider.
- **Error mapper:** each subclass → status + code; ZodError → 400 with details; an unknown error → 500 with no internal message leaked.
- **ProvisioningService** with in-memory fakes:
  - all mailboxes succeed → ACTIVE
  - one fails → FAILED with a `lastError`
  - a retried order only provisions non-ACTIVE mailboxes
  - claim returns null → `'idle'`
- **OrderService authorization:** a customer can't read another customer's order (NotFound); a customer can't retry (Forbidden); a customer's list is forced to their own orders.

**Integration (real Postgres, test DB)**
- **Order creation (the required one):**
  - creates the order + N mailboxes + 1 audit row
  - the same key twice → same order id, still 1 row
  - `Promise.all` of 5 creates with the same key → exactly 1 order (proves the race is handled)
  - same key, different customer → 2 orders
  - same key, different payload → ConflictError
- **Claim concurrency:** seed 10 PENDING orders and run 20 parallel `claimNextPending()` calls. Expect exactly 10 non-null results with distinct ids, every claimed order in PROVISIONING, and one audit row each.
- **Transition conflict:** a stale `expectedFrom` → ConflictError and no audit row written.

## Verification
1. `docker compose up -d --wait && npx prisma migrate dev && npm run db:seed`
2. `npm run typecheck && npm test`: unit + integration green
3. `npm run dev`, then two terminals of `npm run worker`. As a customer, create a 2-mailbox order and double-click submit: only one order appears. Watch it go PENDING→PROVISIONING→ACTIVE/FAILED, with per-mailbox status and the audit log on the detail page.
4. As admin, filter by FAILED and provider, paginate, and retry. Only the failed mailboxes are re-provisioned, and the audit log shows `FAILED→PENDING (ADMIN)`.
5. Error contract: `curl` `POST /api/orders` with `mailboxCount: 51` → 400 `{error:{code:'VALIDATION_ERROR',…}}`; retry as a customer → 403; retry on an ACTIVE order → 409.
6. Clean-clone check: fresh clone into `/tmp`, follow the README verbatim, time it (< 10 min).
