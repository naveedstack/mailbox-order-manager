import { z } from "zod";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InvalidTransitionError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/domain/errors";

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export type ErrorResponse = { status: number; body: ErrorBody };

function statusFor(error: AppError): number {
  if (error instanceof ValidationError) return 400;
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof InvalidTransitionError || error instanceof ConflictError) return 409;
  return 500;
}

// The single place that turns thrown errors into the API error contract.
export function toErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid input",
          details: z.flattenError(error),
        },
      },
    };
  }

  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    if (error.details !== undefined) body.error.details = error.details;
    return { status: statusFor(error), body };
  }

  console.error("Unhandled error:", error);
  return {
    status: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
  };
}

// Convenience for route handlers: `catch (e) { return errorResponse(e); }`
export function errorResponse(error: unknown): Response {
  const { status, body } = toErrorResponse(error);
  return Response.json(body, { status });
}
