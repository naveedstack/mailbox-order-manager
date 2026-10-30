# AI Work Log

Tool: Claude Code CLI (only AI coding tool used)
Start: 2026-10-30, 20:00 PKT
Hard cap (4h): 24:00 PKT

## Planning approach
- Read TASK.md and made the core design decisions myself before bringing Claude in: a unique constraint for idempotency, a pure state machine, an atomic worker claim using `FOR UPDATE SKIP LOCKED`, providers behind a Strategy interface, and strict layering.
- Gave those decisions to Claude Code in plan mode and asked for a phased plan that followed TASK.md's priority order. I also asked it to point out anything in my decisions it thought was wrong or risky.
- Reviewed the plan myself. I kept its improvements, fixed what it missed, and cut scope to fit the 4h cap: tests split into MUST and STRETCH tiers, phase budgets rebalanced, and a cut order added.
- Before approving, I had Claude Code review the revised plan again. It found 4 more gaps and I accepted all of them.
- Committed the plan as `docs/PLAN.md` before writing any feature code.
- Each phase follows the same loop: `/clear`, plan mode if the phase is non-trivial, implement with tests, review the diff myself, then commit in small conventional commits.

## Running log
<!-- HH:MM, what happened -->
- 20:00: Started. Read TASK.md and installed the skills I expected to need (Next.js App Router, Prisma, shadcn, Vitest, TDD, conventional-commit).
- 20:05: Scaffolded Next.js with TypeScript (strict), Tailwind, shadcn, Prisma, docker-compose and Vitest. Ran `/init`, then edited CLAUDE.md by hand to add architecture rules, commands, and a note about local Postgres.
- 20:12: Sent the planning prompt in plan mode, along with my table of design decisions.
- 20:17: Got the plan back with 13 flagged issues and went through each one.
- 20:25: Sent the correction prompt with 8 changes to the plan.
- 20:33: Claude Code's review of the revised plan found 4 gaps: seed mailbox rows, `next typegen`, vitest `projects`, and a schedule 10 min over budget. I accepted all four and scheduled the fixes for Phase 0.
- 20:38: Approved the plan, saved it to `docs/PLAN.md`, and committed it along with this worklog.
- 20:43: Claude Code asked me to approve the whole plan at once. I said no and added an execution protocol: it works on one phase at a time and stops after each phase so I can review it. I put the same rule in CLAUDE.md so it survives /clear.
- 20:45: Added a commit-approval rule to the plan and to CLAUDE.md. Claude Code can’t commit until I’ve reviewed the staged diff and the commit message.
- 20:52: Committed and pushed the plan and worklog.

## Key prompts (3–5)

### 1. Planning with my design decisions (plan mode)
**Prompt:**
> Read @TASK.md and @CLAUDE.md. Here are my design decisions: [table: idempotent creation, state machine, transition + audit, safe worker, provider, per-mailbox status, layers, errors, auth, known limitation]. Produce an implementation plan in phases matching TASK.md's priority order: Prisma schema (User, Order, Mailbox, OrderAuditLog, enums), folder structure, service and repository interfaces, the worker loop, and test list. Flag anything in my decisions you think is wrong or risky. Don't write code.

**Why:** The architecture decisions were mine, and I wanted Claude to find the holes in them. Plan mode kept it from writing code before the plan was settled.
**Result:** A detailed plan and 13 flagged issues. Several of those issues changed my design (see below).

### 2. Plan correction and scope trim
**Prompt:**
> Good plan. I accept problems 1–4 and 6–13. Changes before I approve: (1) rebalance time, tier tests into MUST/STRETCH; (2) try the CTE claim once, fall back to an interactive transaction; (3) raw SQL bypasses @updatedAt, so set updated_at = now() and increment attempts in the claim; (4) no PROVISIONING orders in the seed; (5) split test:unit / test:integration; (6) retry resets FAILED mailboxes in the same transaction; (7) document PROVIDER_FAILURE_RATE; (8) container.ts stays minimal.

**Why:** The plan was mostly sound, but it would not fit in the time cap and it had two correctness gaps.
**Result:** Updated `docs/PLAN.md`. When Claude Code reviewed it a second time, it found 4 more gaps (see below).

### 3. <State machine TDD prompt — fill in when sent>
**Prompt:**
**Why:**
**Result:**

### 4. <Worker claim / concurrency prompt — fill in when sent>
**Prompt:**
**Why:**
**Result:**

### 5. <Independent review prompt — fill in when sent>
**Prompt:**
**Why:**
**Result:**

## Where Claude Code was wrong (and how I fixed it)

### 1. Claim SQL ignored that raw SQL bypasses Prisma's `@updatedAt`
- **What it did:** The planned CTE claim updated `status` and `claimed_at` but left `updated_at` alone. Prisma sets `@updatedAt` only when the write goes through the Prisma client, so claimed orders would have kept a stale `updated_at`.
- **How I caught it:** I compared the claim SQL in the plan against the schema.
- **Fix:** The claim now sets `updated_at = now()` explicitly and increments `attempts`, and the claim concurrency test checks that `updated_at` changed.

### 2. Seed data would have created permanently stuck orders
- **What it did:** The plan seeded orders "in mixed states", with PROVISIONING among them.
- **How I caught it:** No worker ever claims an order that is already PROVISIONING, so a seeded one would never finish. In the demo that would have looked like a worker bug.
- **Fix:** The seed now creates only PENDING, ACTIVE and FAILED orders.

### 3. Time budget didn't fit the cap
- **What it did:** It gave README, ARCHITECTURE, the worklog, the clean-clone test and the video 25 minutes in total, and treated every test on the list as required.
- **Fix:** Rebalanced the phases so docs and video get 45 minutes, split the tests into MUST and STRETCH, and wrote down a cut order. The revised schedule still ran 10 minutes over. Claude Code caught that on the second review, and I trimmed it.

### 4. <fill in during implementation>
- **What it did:**
- **How I caught it:**
- **Fix:**

## Where Claude improved my design
- P2002 re-read after rollback: a unique violation aborts the Postgres transaction, so the lookup of the existing order has to run after the rollback. That lookup lives in the repository, so services never see Prisma error codes.
- Actor-aware state machine: with `assertTransition(from, to, actorType)`, the admin-only retry rule sits in the pure transition table and gets unit-tested with the rest of it, rather than living as a one-off check in the service.
- Failure-rate math: at a 20% failure rate per mailbox, a 50-mailbox order succeeds about 0.001% of the time. I made the rate configurable and kept per-mailbox retries so orders eventually finish.
- Same key, different payload: the API returns 409 instead of quietly handing back the old order.
- Customer accessing another customer's order: the response is 404, not 403, so it doesn't reveal that the order exists.
- Next 16 specifics: use `proxy.ts` in place of `middleware.ts`, and remove `cacheComponents` since the app is authenticated and fully dynamic.
- bcryptjs over native bcrypt: native bcrypt's install script can fail on a clean clone.

### Gaps Claude Code caught in the revised plan (second review, 20:33)
- Seed orders lacked mailbox rows: a seeded PENDING order with no mailboxes would get claimed and go straight to ACTIVE, because "all mailboxes ACTIVE" is true of an empty list. Seeded FAILED orders would have had nothing to retry. Fix: each seeded order gets `mailboxCount` mailbox rows with statuses that match the order's status.
- `typecheck` dropped `next typegen`: Next 16 generates the prop types for routes and pages, and a clean clone can fail typecheck without them. Fix: keep `next typegen && tsc --noEmit`.
- Test split needs vitest `projects`: this lets `test:unit` run without Postgres, and only the integration project uses the DB `globalSetup`.
- Schedule 10 min over budget: I took the 10 minutes out of the buffer. If anything else runs long, I fall back on the cut order.

## What I changed by hand
- CLAUDE.md: rewrote the architecture rules and commands that `/init` generated, and added a note telling Claude to ignore Supabase-specific advice because the project uses local Postgres.
- docs/PLAN.md: the scope cuts and corrections described above.
- <fill in during implementation>

## Time per phase
| Phase | Planned | Actual start | Actual end | Minutes |
|---|---|---|---|---|
| Setup: scaffold + CLAUDE.md | 20:00–20:12 | 20:00 | 20:12 | 12 |
| Planning + plan review | 20:12–20:38 | 20:12 | 20:38 | 26 |
| 0 Foundations | 20:38–20:53 (15m) | | | |
| 1 Order creation + state machine | 20:53–21:33 (40m) | | | |
| 2 Provider + worker | 21:33–22:08 (35m) | | | |
| 3 Auth + admin | 22:08–22:43 (35m) | | | |
| 4 Customer views | 22:43–22:58 (15m) | | | |
| 5 Review + fixes | 22:58–23:08 (10m) | | | |
| 6 Docs + video | 23:08–23:53 (45m) | | | |
| Buffer | 23:53–24:00 (7m) | | | |
| **Total** | **4h 00m** | | | |

## Unfinished / would do next
-