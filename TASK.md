# Full Stack Engineer Test Task: Mailbox Order Manager

**Stack:** Next.js (App Router, TypeScript) + PostgreSQL
**Tool:** Claude Code CLI
**Time:** 3 to 4 hours of working with Claude Code, hard cap.

We want to see how you work with an AI coding agent: how you plan, steer and review, how fast you move, and which design patterns you choose.

## What to build

A small internal tool for a company that sells pre-warmed Google and Microsoft mailboxes.

- Login with seeded users and two roles: `customer` (sees own orders) and `admin` (sees all).
- A customer creates an order: domain, provider (`google` or `microsoft`), mailbox count (1 to 50). Order creation is idempotent.
- Status flow: `PENDING → PROVISIONING → ACTIVE` or `FAILED`. An admin can retry `FAILED → PENDING`. Invalid transitions are rejected, and every transition is saved to an audit log.
- A background worker provisions mailboxes through a provider abstraction (mocked Google and Microsoft, a few seconds per call, about 20% random failure). Running it twice must never process the same order twice.
- Screens: customer order list, create form, order detail with per-mailbox status and audit log; admin list with status and provider filters, pagination and a retry button.
- Input validation (for example zod) and consistent error responses.

## Technical rules

- Strict TypeScript, PostgreSQL with Prisma or Drizzle, migrations and seed data, `docker-compose.yml` for Postgres, `.env.example`.
- Layered code: no business logic in route handlers or components.
- Unit tests for the state machine and one integration test for order creation.
- `docs/ARCHITECTURE.md`: name each design pattern you used (for example Strategy, state machine, repository or service layer, queue and worker), where it lives, why you chose it, and one alternative you rejected.

## Claude Code evidence

- `CLAUDE.md` in the repo root.
- `docs/AI_WORKLOG.md`: your planning approach, 3 to 5 key prompts, at least 2 times Claude Code was wrong and how you fixed it, what you changed by hand, and time per phase with a total.
- Small, meaningful commits (no single giant commit).

## What to submit

- GitHub repo shared with us, and a README that runs on a clean clone in under 10 minutes: setup, migrations, seed, how to start the app and worker, admin and customer logins, how to run tests, known limitations.
- A 2 to 3 minute demo video linked at the top of the README: customer creates an order, one success and one failure, admin sees the audit log and retries, tests run.

If you reach 4 hours, stop and list what is unfinished. Priority order:

1. Order creation and state machine
2. Provider abstraction and worker
3. Admin list with retry and audit log
4. Customer views
5. Tests

## How we review

| Area | Weight |
| --- | --- |
| Approach with Claude Code (planning, steering, critical review) | 25% |
| Design patterns and architecture | 20% |
| Correctness and robustness (idempotency, safe worker) | 20% |
| Code quality and tests | 15% |
| Time management against scope delivered | 10% |
| README, video, commit history | 10% |

**Red flags:** one giant commit, business logic in route handlers, no sign the AI output was reviewed, a README that fails on a clean machine.

**Rules:** Claude Code is your only AI coding tool. The work must be your own, and you must be able to explain every part in a follow-up call.
