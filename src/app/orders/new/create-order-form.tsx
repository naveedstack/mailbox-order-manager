"use client";
// The idempotency key is created once per form mount and reused for every
// submit until the user explicitly starts a new order: a double click or a
// retry after a network error can't create a second order. It lives only in
// state (never rendered), because the useState initializer runs separately on
// the server and the client.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import {
  describeApiError,
  parseCreateOrderForm,
  type ApiErrorView,
} from "@/components/orders/create-order-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

export function CreateOrderForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<ApiErrorView>({});
  const errors = view.fieldErrors ?? {};

  // A genuinely new order needs a new key; otherwise the server would treat it
  // as a replay of the one already created with this key.
  function startNewOrder() {
    formRef.current?.reset();
    setIdempotencyKey(crypto.randomUUID());
    setView({});
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCreateOrderForm(new FormData(event.currentTarget), idempotencyKey);
    if (!parsed.ok) {
      setView({ fieldErrors: parsed.fieldErrors });
      return;
    }

    setPending(true);
    setView({});
    let res: Response;
    try {
      res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.input),
      });
    } catch {
      setView({
        formError: "Network error. Please try again; resubmitting won't create a duplicate order.",
      });
      setPending(false);
      return;
    }

    const body: unknown = await res.json().catch(() => null);
    const orderId = (body as { order?: { id?: string } } | null)?.order?.id;
    if (res.ok && orderId) {
      // 201 (created) or 200 (this key was already used: same order).
      router.push(`/orders/${orderId}`);
      return;
    }

    const error = describeApiError(res.status, body);
    if (error.unauthorized) {
      router.push("/login?next=/orders/new");
      return;
    }
    setView(error);
    setPending(false);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      <fieldset disabled={pending} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Domain
          <Input
            name="domain"
            placeholder="example.com"
            autoComplete="off"
            aria-invalid={Boolean(errors.domain)}
            aria-describedby="domain-error"
          />
          <FieldError id="domain-error" messages={errors.domain} />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium" role="radiogroup" aria-describedby="provider-error">
          Provider
          <div className="flex gap-4 font-normal">
            <label className="flex items-center gap-2">
              <input type="radio" name="provider" value="google" defaultChecked /> Google Workspace
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="provider" value="microsoft" /> Microsoft 365
            </label>
          </div>
          <FieldError id="provider-error" messages={errors.provider} />
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Mailboxes (1–50)
          <Input
            name="mailboxCount"
            type="number"
            min={1}
            max={50}
            defaultValue={1}
            className="w-32"
            aria-invalid={Boolean(errors.mailboxCount)}
            aria-describedby="mailboxCount-error"
          />
          <FieldError id="mailboxCount-error" messages={errors.mailboxCount} />
        </label>

        {view.formError && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
            <p>{view.formError}</p>
            {view.existingOrderId && (
              <p className="flex gap-4">
                <Link href={`/orders/${view.existingOrderId}`} className="underline underline-offset-4">
                  Open that order
                </Link>
                <button type="button" onClick={startNewOrder} className="underline underline-offset-4">
                  Start a new order
                </button>
              </p>
            )}
          </div>
        )}

        <Button type="submit" size="lg" className="self-start" disabled={pending}>
          {pending ? "Placing order…" : "Place order"}
        </Button>
      </fieldset>
    </form>
  );
}
