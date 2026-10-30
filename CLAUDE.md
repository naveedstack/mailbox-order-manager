# Mailbox Order Manager
## Commands
- docker compose up -d · npm run dev · npm run worker · npm test · npx prisma migrate dev · npm run db:seed
- npm run test:unit (no DB) · npm run test:integration (uses the `<db>_test` database) · npm run typecheck
## Architecture rules (IMPORTANT)
- No business logic in route handlers, server actions or components. They parse input (zod),
  call a service, and map errors.
- domain/ is pure (no Prisma). services/ orchestrate. repositories/ are the only Prisma users.
- Every status change goes through OrderService.transition(): conditional update + audit log in ONE transaction.
  The ONE exception is the worker claim (PENDING → PROVISIONING): it lives in
  OrderRepository.claimNextPending() as an atomic SKIP LOCKED query that writes its own audit row.
  A unit test keeps it in sync with the state machine table.
- Worker claims orders only via OrderRepository.claimNextPending().
- Errors: throw AppError subclasses; API returns { error: { code, message, details? } }.
## Workflow
- Implement docs/PLAN.md one phase at a time; stop after each phase for review.
- IMPORTANT: Never run git commit without asking me first. Show the staged diff stat
  and proposed message, then wait for approval.
- TDD for domain logic. Run typecheck + tests before saying a task is done.
- Small commits using the conventional-commit skill.
- Local Postgres via docker.