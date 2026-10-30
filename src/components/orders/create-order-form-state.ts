// Pure logic behind the create-order form, kept out of the component so it can
// be unit tested. Client-safe: imports only the shared domain schema.
import { z } from "zod";
import { createOrderInput, type CreateOrderInput } from "@/domain/schemas";

export type FieldErrors = Partial<Record<keyof CreateOrderInput, string[]>>;

export type ParsedForm = { ok: true; input: CreateOrderInput } | { ok: false; fieldErrors: FieldErrors };

// Same schema as the server, so the client catches what the API would reject.
export function parseCreateOrderForm(form: FormData, idempotencyKey: string): ParsedForm {
  const count = form.get("mailboxCount");
  const result = createOrderInput.safeParse({
    domain: form.get("domain") ?? "",
    provider: form.get("provider") ?? "",
    // "" and "abc" become NaN, which the schema rejects as "not a number".
    mailboxCount: typeof count === "string" && count.trim() !== "" ? Number(count) : Number.NaN,
    idempotencyKey,
  });
  if (result.success) return { ok: true, input: result.data };
  return { ok: false, fieldErrors: z.flattenError(result.error).fieldErrors };
}

export type ApiErrorView = {
  fieldErrors?: FieldErrors;
  formError?: string;
  existingOrderId?: string;
  unauthorized?: true;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

const apiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
const validationDetails = z.object({ fieldErrors: z.record(z.string(), z.array(z.string())) });
const conflictDetails = z.object({ orderId: z.string() });

// Turns the API error contract ({ error: { code, message, details? } }) into
// what the form shows.
export function describeApiError(status: number, body: unknown): ApiErrorView {
  if (status === 401) return { unauthorized: true };

  const parsed = apiErrorBody.safeParse(body);
  if (!parsed.success) return { formError: GENERIC_ERROR };
  const { code, message, details } = parsed.data.error;

  if (code === "VALIDATION_ERROR") {
    const fields = validationDetails.safeParse(details);
    if (fields.success && Object.keys(fields.data.fieldErrors).length > 0) {
      return { fieldErrors: fields.data.fieldErrors };
    }
    return { formError: message };
  }

  if (code === "IDEMPOTENCY_KEY_REUSED") {
    const conflict = conflictDetails.safeParse(details);
    return {
      formError:
        "This form was already submitted with different values. Open the order it created, or start a new order.",
      ...(conflict.success && { existingOrderId: conflict.data.orderId }),
    };
  }

  return { formError: message || GENERIC_ERROR };
}
