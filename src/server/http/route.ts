// Plumbing that keeps route handlers to "parse -> call service -> respond".
import { ValidationError } from "@/domain/errors";
import { errorResponse } from "./error-mapper";

// Any thrown error becomes the API error contract via the single mapper.
export function withErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

// Invalid JSON is a client error (400), not a 500. With `optional`, an empty
// body reads as {}.
export async function readJson(
  req: Request,
  options: { optional?: boolean } = {},
): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") {
    if (options.optional) return {};
    throw new ValidationError("Request body must be a JSON object");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}
