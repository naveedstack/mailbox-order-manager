# Mailbox Order Manager
## Commands
- docker compose up -d · npm run dev · npm run worker · npm test · npx prisma migrate dev · npm run db:seed
## Architecture rules (IMPORTANT)
- No business logic in route handlers, server actions or components. They parse input (zod),
  call a service, and map errors.
- domain/ is pure (no Prisma). services/ orchestrate. repositories/ are the only Prisma users.
- Every status change goes through OrderService.transition(): conditional update + audit log in ONE transaction.
- Worker claims orders only via the atomic SKIP LOCKED query in OrderRepository.claimNextPending().
- Errors: throw AppError subclasses; API returns { error: { code, message, details? } }.
## Workflow
- TDD for domain logic. Run typecheck + tests before saying a task is done.
- Small commits using the conventional-commit skill.
- Local Postgres via docker.