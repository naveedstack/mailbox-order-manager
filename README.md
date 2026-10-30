# Mailbox Order Manager

**Demo video:** <link>

An internal tool for selling pre-warmed Google and Microsoft mailboxes. Customers place orders (domain,
provider, 1–50 mailboxes); a background worker provisions them through mocked provider APIs; admins
see every order, its per-mailbox status and audit log, and retry failed orders.

- Order creation is idempotent (`idempotencyKey` per form, unique per customer).
- Status flow `PENDING → PROVISIONING → ACTIVE | FAILED`, admin retry `FAILED → PENDING`. Invalid
  transitions are rejected and every transition is written to an audit log in the same transaction.
- Any number of workers can run: each claims orders with `SELECT … FOR UPDATE SKIP LOCKED`, so an
  order is never processed twice.

**Stack:** Next.js 16 (App Router, strict TypeScript), React 19, PostgreSQL 16 (Docker), Prisma 7,
zod, JWT sessions (jose) with bcrypt passwords, Tailwind + shadcn/ui, Vitest.

Design and patterns: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). How this was built with Claude
Code: [docs/AI_WORKLOG.md](docs/AI_WORKLOG.md).

## Prerequisites

- Node.js 20.19+, 22.12+ or 24+ (Prisma 7's requirement)
- Docker with Compose v2 (`docker compose`)
- Free ports: 5433 (Postgres) and 3000 (app)

## Setup (clean clone)

```bash
cp .env.example .env            # defaults work as-is
docker compose up -d            # Postgres 16 on localhost:5433
npm install                     # also runs `prisma generate`
npx prisma migrate deploy       # apply migrations
npm run db:seed                 # users + 12 sample orders; safe to rerun (resets them)
```

## Run

```bash
npm run dev        # app on http://localhost:3000
npm run worker     # second terminal: provisions PENDING orders
```

Open the app on `localhost`, not a LAN IP: the create form needs `crypto.randomUUID()`, which
browsers only allow on localhost or HTTPS.

**Two workers:** run `npm run worker` in a third terminal as well. Both pick up orders, and each
order's audit log still shows exactly one `PENDING → PROVISIONING` claim per attempt.

**Seeing failures in a demo:** each mailbox fails with probability `PROVIDER_FAILURE_RATE` (default
0.2) and one failed mailbox fails the order. To make failures common:

```bash
PROVIDER_FAILURE_RATE=0.5 npm run worker
```

## Logins (from the seed)

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@example.com | Admin123! |
| Customer | alice@example.com | Customer123! |
| Customer | bob@example.com | Customer123! |

## Tests

```bash
npm run test:unit          # state machine, schemas, providers, worker loop, auth, form logic; no database
npm run test:integration   # needs Postgres running; uses mailbox_orders_test (created and migrated automatically)
npm test                   # both
npm run typecheck && npm run lint
```

## Known limitations

- **An order can stay in `PROVISIONING` forever** if a worker crashes, or the database drops,
  in the middle of an order. Nothing reclaims it. The fix is a `claimedAt` lease with
  claim-token fencing, so another worker can take over a stale claim and the old one can no
  longer write. Retrying the final transition alone isn't safe: if the first commit actually
  succeeded, the retry reports a false conflict.
- **Ctrl+C on `npm run worker`** exits immediately instead of finishing the order in progress.
  npm passes SIGINT on a second time, and the worker treats a second signal as "force quit". An
  order in progress then hits the limitation above.
- Sessions are stateless JWTs (8 h). Logging out clears the cookie, but a copied token stays valid
  until it expires, and role changes only apply at the next login.

Review findings not fixed yet:

- A session for a user deleted after login returns 500 instead of 401.
- `/login?next=` accepts `/%09/evil.example`, so after login the user can be redirected to
  another site (open redirect).
- The UI falls back to the browser's serif font instead of Geist (`--font-sans` refers to itself
  in `globals.css`).
- An out-of-range mailbox count shows zod's default message ("Too small: expected number to be
  >=1") instead of a friendly one.

## Unfinished (4-hour cap)

- The `claimedAt` lease and claim-token fencing above.
- The review fixes listed above.
- No React component tests. The form logic is unit-tested as pure functions, and the screens
  were checked by hand in Chrome.
