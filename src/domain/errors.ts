// Domain errors. Pure: no HTTP or Prisma knowledge. The HTTP status for each
// class is decided in src/server/http/error-mapper.ts.

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INTERNAL_ERROR";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR";
}

export class UnauthorizedError extends AppError {
  readonly code = "UNAUTHORIZED";

  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  readonly code = "FORBIDDEN";

  constructor(message = "You are not allowed to perform this action") {
    super(message);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND";

  constructor(resource: string, id?: string) {
    super(id ? `${resource} ${id} not found` : `${resource} not found`);
  }
}

export class InvalidTransitionError extends AppError {
  readonly code = "INVALID_TRANSITION";

  constructor(from: string, to: string, actorType: string) {
    super(`Transition ${from} -> ${to} is not allowed for ${actorType}`, {
      from,
      to,
      actorType,
    });
  }
}

export class ConflictError extends AppError {
  readonly code: "CONFLICT" | "IDEMPOTENCY_KEY_REUSED";

  constructor(
    message: string,
    options: { code?: "CONFLICT" | "IDEMPOTENCY_KEY_REUSED"; details?: unknown } = {},
  ) {
    super(message, options.details);
    this.code = options.code ?? "CONFLICT";
  }
}
