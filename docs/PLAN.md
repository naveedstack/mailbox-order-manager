# Mailbox Order Manager — Implementation Plan

## Context
Take-home task (TASK.md): Next.js + Postgres internal tool with idempotent order creation, a strict order state machine with audit log, a safe background worker using mocked Google/Microsoft providers, admin and customer screens, tests, and docs. 4h hard cap, built in TASK.md's priority order. Reviewers weight correctness (idempotency, safe worker), layering, and visible review of AI output.

**Already in the repo:** Next **16.4.3** (middleware is now `proxy.ts`; `cacheComponents: true` set in `next.config.ts`), Prisma **7.10.1** with `@prisma/adapter-pg` (client generated to `src/generated/prisma`, URL in `prisma.config.ts`), `prisma` singleton in `src/server/db.ts` (reuse it), zod 4.6, vitest with `@` alias, tsx, docker-compose (Postgres 16 on host port 5433), shadcn `button`. jose and bcryptjs **not** installed. Folder is **not a git repo yet**.

---

## Design decisions (final, after review)

1. **Idempotent creation.** Client generates `idempotencyKey` (UUID) on form mount. Unique constraint on `(customerId, idempotencyKey)`. `OrderRepository.createIdempotent()` creates order + mailboxes + creation audit row in one `$transaction`. On P2002 (match `code === 'P2002'` only; `meta.target` differs with the pg adapter), re-read the existing order **after** the rollback (an aborted Postgres transaction can't run further queries). Returns `{ order, created }`. Services never see Prisma error codes.
2. **Same key, different payload** (domain/provider/count differ) → `409 ConflictError` code `IDEMPOTENCY_KEY_REUSED`.
3. **Actor-aware state machine.** Table is `from → to → allowedActors`; signature `assertTransition(from, to, actorType)`. Allowed:
   - `PENDING → PROVISIONING` (SYSTEM)
   - `PROVISIONING → ACTIVE` (SYSTEM)
   - `PROVISIONING → FAILED` (SYSTEM)
   - `FAILED → PENDING` (ADMIN)
   Everything else, including same-state, is rejected with `InvalidTransitionError`.
4. **Single gate with one documented exception.** Every status change goes through `OrderService.transition()`, except the worker claim (`OrderRepository.claimNextPending()`, raw SQL). A unit test asserts `PENDING → PROVISIONING` by SYSTEM is allowed by the table so SQL and table can't drift. CLAUDE.md wording updated to say this.
5. **Atomic claim.** Try a single-statement CTE first:
   `WITH claimed AS (UPDATE orders SET status='PROVISIONING'::"OrderStatus", claimed_at=now(), updated_at=now(), attempts=attempts+1 WHERE id = (SELECT id FROM orders WHERE status='PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) AND status='PENDING' RETURNING *), audit AS (INSERT INTO order_audit_logs … SELECT … FROM claimed) SELECT * FROM claimed`
   - Use real `@@map` table/column names; cast enums; map snake_case result back to the domain type in the repo.
   - **Raw SQL bypasses Prisma's `@updatedAt`**, so `updated_at = now()` is set explicitly. `attempts` is incremented here.
   - **Fallback (if the CTE fights enum casts/mapping after one attempt):** interactive `$transaction` running the `$queryRaw` SKIP LOCKED claim, then `auditLog.create`. Equally atomic.
6. **Provider failures are per mailbox.** 20% per call makes 50-mailbox orders almost never succeed (0.8⁵⁰ ≈ 0.001%) and take 50–150s sequentially. So:
   - bounded concurrency (5) per order
   - `PROVIDER_FAILURE_RATE`, `PROVIDER_MIN_DELAY_MS`, `PROVIDER_MAX_DELAY_MS` env-configurable (default 0.2, 1000, 3000)
   - retry only re-provisions non-ACTIVE mailboxes, so orders converge over retries (README)
   - demo: small orders (1–3 mailboxes) and `PROVIDER_FAILURE_RATE=0.5` to get a failure reliably on video
7. **Retry resets failed mailboxes.** `FAILED → PENDING` (ADMIN) also sets that order's FAILED mailboxes back to PENDING in the **same transaction**, so the UI is consistent.
8. **Stuck PROVISIONING (documented limitation).** Add `claimedAt` column now (future lease = small follow-up). Worker handles SIGINT/SIGTERM gracefully (stop claiming, finish current order). README notes a naive reaper would break "never process twice" unless the final transition is fenced on a claim token.
9. **Next 16:** route protection in `src/proxy.ts` (optimistic only; services enforce access). Remove `cacheComponents` and `partialPrefetching` from `next.config.ts` (fully dynamic authenticated app).
10. **Auth:** `bcryptjs` (not native `bcrypt`; avoids install scripts on clean clone). HS256 JWT `{sub, role}` signed with `AUTH_SECRET` in httpOnly, SameSite=Lax cookie, 8h expiry.
11. **Authorization errors:** customer requesting another customer's order → `NotFoundError` (no existence leak). `ForbiddenError` for role violations (customer calling retry).
12. **Idempotency key generated in a client component** (`useState(() => crypto.randomUUID())`). After create, redirect to detail page so a new form mounts a fresh key.
13. **Composition root stays minimal.** `container.ts` = plain factory functions wiring repos → services. No DI library.
14. **Repo hygiene:** `git init` before first commit; task PDF stays out of the repo (`.gitignore`).

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
  attempts Int @default(0),            // incremented by the claim
  lastError String?, claimedAt DateTime?,
  createdAt, updatedAt                 // updatedAt set explicitly in raw SQL
  mailboxes Mailbox[], auditLogs OrderAuditLog[]
  @@unique([customerId, idempotencyKey])
  @@index([status, createdAt])         // worker claim + admin filter
  @@index([customerId, createdAt])     // customer list
}

model Mailbox {       // @@map("mailboxes")
  id uuid pk, orderId -> Order (onDelete: Cascade),
  address String,                      // mailbox-01@<domain>
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

**Seed:** `admin@example.com` + 2 customers (bcryptjs hashes), plus a few orders in **PENDING, ACTIVE and FAILED only**. **No PROVISIONING orders**: no worker owns them, so they would be stuck forever. Each order gets exactly `mailboxCount` mailbox rows, with statuses consistent with the order:
- **PENDING** → all mailboxes PENDING; audit: `null → PENDING` (CUSTOMER)
- **ACTIVE** → all mailboxes ACTIVE (with `externalId`); audit: `null → PENDING` (CUSTOMER), `PENDING → PROVISIONING` (SYSTEM), `PROVISIONING → ACTIVE` (SYSTEM)
- **FAILED** → at least one mailbox FAILED with `lastError`, the rest ACTIVE; order `lastError` set; audit: `null → PENDING`, `PENDING → PROVISIONING`, `PROVISIONING → FAILED` (SYSTEM, reason "n of m mailboxes failed")

Audit timestamps increase in order of each order's history. The seed is idempotent (it deletes the seed data and recreates it), so re-running it is safe.

---

## Folder structure (`src/`)

```
domain/            pure TS, no Prisma
  order-state-machine.ts   transition table + assertTransition(from,to,actorType)
  errors.ts                AppError + ValidationError/NotFoundError/ForbiddenError/
                           InvalidTransitionError/ConflictError/UnauthorizedError
  types.ts                 Actor {userId, role}, status/provider TS unions
  schemas.ts               zod: createOrderInput, listOrdersQuery, loginInput, retryInput
repositories/      only Prisma users
  order-repository.ts, mailbox-repository.ts, user-repository.ts
services/
  order-service.ts, provisioning-service.ts, auth-service.ts
providers/
  mailbox-provider.ts (interface), mock-provider-base.ts,
  mock-google-provider.ts, mock-microsoft-provider.ts, registry.ts
server/
  db.ts (exists), container.ts (plain factories),
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

**Mutations go through route handlers; reads go through Server Components calling services.** Route handlers make the `{ error: { code, message, details? } }` + HTTP status contract real and testable. Pages map `NotFoundError → notFound()` and `UnauthorizedError → redirect('/login')`.

---

## Interfaces (signatures only)

**OrderRepository**
- `createIdempotent(data: NewOrder, audit: AuditInput) → { order, created }`: order + mailboxes + `null→PENDING` audit row in one transaction; on P2002, `findByKey` after rollback.
- `findById(id) → OrderWithDetails | null` (mailboxes + audit log ordered by `createdAt`)
- `list(filter: {customerId?, status?, provider?}, page: {page, pageSize}) → { items, total }`
- `transition(id, expectedFrom, to, audit, effects?) → boolean`: one `$transaction`: `updateMany where {id, status: expectedFrom}`; only if `count === 1`, insert audit row and apply effects. `effects = { lastError?: string; resetFailedMailboxes?: boolean }`.
- `claimNextPending() → Order | null`: CTE claim (fallback: interactive transaction). Sets `claimed_at`, `updated_at`, increments `attempts`, writes audit row.

**MailboxRepository:** `listNotActive(orderId)`, `markActive(id, externalId)`, `markFailed(id, error)` (both increment mailbox `attempts`)

**UserRepository:** `findByEmail(email)`, `findById(id)`

**OrderService** (deps injected via factory)
- `createOrder(actor, input)`: CUSTOMER only; payload-mismatch check → `ConflictError`
- `getOrder(actor, id)`: ownership check → `NotFoundError`
- `listOrders(actor, query)`: customers forced to own `customerId`; admins filter freely
- `retryOrder(actor, id, reason?)` → `transition(id, 'PENDING', actor, reason, { resetFailedMailboxes: true })`
- `transition(id, to, actor, reason?, effects?)`: **the single gate**: read current status → `assertTransition` → `repo.transition`; on `false`, re-read: missing → `NotFoundError`, else → `ConflictError`.

**MailboxProvider:** `readonly name: Provider`; `provisionMailbox({ address, domain }) → Promise<{ externalId }>`, throws `ProviderError`. Mocks take `{ rng, sleep, failureRate, minDelayMs, maxDelayMs }`. `ProviderRegistry.get(provider)` throws on unknown.

**ProvisioningService:** `processNext() → 'idle' | 'processed'`
1. `claimNextPending()` or return `'idle'`
2. `listNotActive`
3. provision with concurrency 5, marking each mailbox active/failed
4. all ACTIVE → `transition(ACTIVE, SYSTEM)`; else `transition(FAILED, SYSTEM, "n of m mailboxes failed", { lastError })`. Unexpected exception → attempt `transition(FAILED)` and log.

**AuthService:** `login(email, password) → SessionPayload` (bcryptjs compare; same error for unknown user and wrong password).

**Error mapper**

| Error | Status | Code |
|---|---|---|
| `ValidationError`, `ZodError` | 400 | `VALIDATION_ERROR` (`details` = flattened issues) |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `InvalidTransitionError` | 409 | `INVALID_TRANSITION` |
| `ConflictError` | 409 | `CONFLICT` / `IDEMPOTENCY_KEY_REUSED` |
| unknown | 500 | `INTERNAL_ERROR` (generic message, logged server-side) |

## Worker loop
`npm run worker` → `tsx src/worker/index.ts`. Env: `WORKER_POLL_MS=1000`.
1. While not stopping: `processNext()`; if idle, sleep `WORKER_POLL_MS` (interruptible). Errors logged, back off, continue.
2. SIGINT/SIGTERM → `stopping = true`; current order finishes; `prisma.$disconnect()`.
3. One order per process at a time. Safety demo: two workers in two terminals; SKIP LOCKED keeps their order sets disjoint.

---

## Scripts

| Script | Purpose |
|---|---|
| `test:unit` | `vitest run --project unit`: unit tests, no DB needed |
| `test:integration` | `vitest run --project integration`: against docker Postgres (test DB via `globalSetup`) |
| `test` | runs both projects |
| `typecheck` | `next typegen && tsc --noEmit` (keep typegen so Next 16 route/page types are fresh on a clean clone) |
| `worker` | `tsx src/worker/index.ts` |
| `db:seed` | seed script (also wired in `prisma.config.ts`) |

Tests are split with vitest `projects`: `unit` (`src/**/*.test.ts`, no setup) and `integration` (`tests/integration/**/*.test.ts`, with `globalSetup`). The DB setup is attached **only** to the integration project, so `test:unit` never needs Postgres.

Integration `globalSetup`: `CREATE DATABASE mailbox_orders_test` if missing → `prisma migrate deploy` with `DATABASE_URL` overridden → truncate between tests. (Init scripts in `docker-entrypoint-initdb.d` only run on a fresh volume, so don't rely on them.)

`.env.example`: `DATABASE_URL`, `AUTH_SECRET`, `WORKER_POLL_MS=1000`, `PROVIDER_FAILURE_RATE=0.2` (comment: use 0.5 for demos), `PROVIDER_MIN_DELAY_MS=1000`, `PROVIDER_MAX_DELAY_MS=3000`.

---

## Execution protocol

- **One phase at a time.** When a phase is done, run `npm run typecheck` and the relevant tests, show the output, summarize what changed, then **STOP** and wait for the go-ahead before starting the next phase.
- **Small conventional commits within a phase.**
- **Never commit without explicit approval.** Before every commit:
  1. Stage the files.
  2. Show `git diff --staged --stat` and the proposed commit message.
  3. Ask "Commit?" and wait for a yes.
  4. If the answer is no or comes with changes, adjust and ask again.
- The current approval covers **Phase 4 only** (Phases 0–3 are done).

### Phase 0 kickoff (git init and the scaffold commit are already done by the user)
1. Check `git status` and `git ls-files`. Make sure `.env`, `node_modules`, `src/generated` and the task PDF are **not** tracked. If any are, fix `.gitignore`, `git rm --cached` them, then ask before committing `chore: fix gitignore`.
2. If CLAUDE.md isn't committed yet, propose committing it alone: `docs: add CLAUDE.md`.
3. Save this plan to `docs/PLAN.md` (including this section and the four fixes) and propose committing it with `docs/AI_WORKLOG.md`: `docs: add implementation plan and AI worklog`.
4. Add these rules to CLAUDE.md under **Workflow** (commit them with the decision-4 wording change, after approval):
   - "Implement docs/PLAN.md one phase at a time; stop after each phase for review."
   - "IMPORTANT: Never run git commit without asking me first. Show the staged diff stat and proposed message, then wait for approval."
5. Do the Phase 0 tasks (row 0 below, minus `git init`), including the four fixes: seed consistency, `next typegen` in `typecheck`, vitest `projects` split, and the budget kept as is. Stop after Phase 0.

## Phases (priority order)

About 45 min already used on setup and planning. Remaining budget to the 4h cap: ~3h15m.

| # | Phase | Deliverables | Budget |
|---|---|---|---|
| 0 | Foundations | gitignore check; add jose, bcryptjs; remove cacheComponents; schema + first migration; `domain/errors.ts`; error mapper; `.env.example`; seed (consistent mailboxes + audit history); vitest `projects` split; keep `next typegen` in `typecheck`; CLAUDE.md wording (decision 4) | 15m |
| 1 | Order creation + state machine | **TDD** state machine; OrderRepository (createIdempotent, transition); OrderService (createOrder, transition); creation + transition integration tests through the service. Services take an `Actor`, so no auth or HTTP yet (`POST /api/orders` moved to Phase 3) | 40m |
| 2 | Provider + worker | Provider interface, mocks, registry; `claimNextPending` (CTE → fallback) + concurrency test; ProvisioningService; worker loop + signals | 35m |
| 3 | Auth + admin | session.ts, AuthService, login/logout routes, `proxy.ts`; `POST /api/orders` + route tests (201 created / 200 replay / 409 key reused / 401 no session); admin list with zod-parsed `searchParams` (status, provider, page), retry route + button, detail page with mailbox + audit tables | 35m |
| 4 | Customer views | Order list, create form (client key + zod), detail page reused with ownership check | 15m |
| 5 | Review + fixes | `/code-review` or subagent review against TASK.md + CLAUDE.md; fix correctness findings only; all MUST tests green | 10m |
| 6 | Docs + video | README (clean-clone steps, logins, limitations), `docs/ARCHITECTURE.md`, finish `docs/AI_WORKLOG.md`, clean-clone test, demo video | 45m |
|   | Buffer | | 10m |

**Cut order if behind schedule:** STRETCH tests → admin pagination polish → customer list styling → graceful-shutdown niceties. Never cut: idempotency, safe claim, audit log, README clean-clone check.

Propose a commit after each green step with the conventional-commit skill, and commit only after approval (see Execution protocol) (expect 15–25 commits).

## Test list

### MUST
- **State machine (unit):** the 4 allowed transitions pass with the right actor; same-state and all other pairs are rejected; a customer can't retry; `InvalidTransitionError` carries `from`/`to`; `PENDING → PROVISIONING` by SYSTEM is allowed (guards SQL/table drift).
- **Order creation (integration):** creates order + N mailboxes + 1 audit row; same key twice → same order id, 1 row; `Promise.all` of 5 creates with the same key → exactly 1 order; same key, different customer → 2 orders; same key, different payload → `ConflictError`.
- **Claim concurrency (integration):** seed 10 PENDING orders, run 20 parallel `claimNextPending()` → exactly 10 non-null, distinct ids, all PROVISIONING, one audit row each, `updated_at` changed.

### STRETCH (only if time remains)
- Exhaustive table-driven state machine test (16 pairs × 3 actors)
- Mock providers: rng < failureRate throws `ProviderError`; delay within bounds; registry
- Error mapper: each subclass → status + code; unknown → 500 without leaking message
- ProvisioningService with in-memory fakes: all succeed → ACTIVE; one fails → FAILED; retry only provisions non-ACTIVE
- OrderService authorization: NotFound for others' orders; Forbidden for customer retry
- Transition conflict: stale `expectedFrom` → `ConflictError`, no audit row
- Retry resets FAILED mailboxes to PENDING

## Verification
1. `docker compose up -d --wait && npx prisma migrate dev && npm run db:seed`
2. `npm run typecheck && npm test` green
3. `npm run dev` + two terminals of `npm run worker` (with `PROVIDER_FAILURE_RATE=0.5`). As a customer, create a 2-mailbox order and double-click submit → one order. Watch PENDING → PROVISIONING → ACTIVE/FAILED with per-mailbox status and audit log.
4. As admin: filter FAILED + provider, paginate, retry → failed mailboxes reset to PENDING, only those re-provisioned; audit log shows `FAILED → PENDING (ADMIN)`.
5. Error contract via `curl`: `mailboxCount: 51` → 400 `VALIDATION_ERROR`; retry as customer → 403; retry on ACTIVE → 409.
6. Clean-clone check: fresh clone into `/tmp`, follow README verbatim, timed (< 10 min).