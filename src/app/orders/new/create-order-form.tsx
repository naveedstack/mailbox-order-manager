"use client";
// The idempotency key is created once per form mount and reused for every
// submit until the user explicitly starts a new order: a double click or a
// retry after a network error can't create a second order. It lives only in
// state (never rendered), because the useState initializer runs separately on
// the server and the client.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { mailboxAddresses } from "@/domain/mailbox";
import { RackPreview } from "@/components/orders/mailbox-rack";
import {
  describeApiError,
  parseCreateOrderForm,
  type ApiErrorView,
} from "@/components/orders/create-order-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PROVIDER_OPTIONS = [
  { value: "google", label: "Google Workspace" },
  { value: "microsoft", label: "Microsoft 365" },
] as const;

// What the preview shows while typing; the real check is parseCreateOrderForm.
function previewOf(form: HTMLFormElement): { domain: string; count: number | null } {
  const data = new FormData(form);
  const domain = String(data.get("domain") ?? "").trim().toLowerCase();
  const count = Number(data.get("mailboxCount"));
  return { domain, count: Number.isInteger(count) && count >= 1 && count <= 50 ? count : null };
}

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
  const [preview, setPreview] = useState<{ domain: string; count: number | null }>({ domain: "", count: 1 });
  const errors = view.fieldErrors ?? {};

  // A genuinely new order needs a new key; otherwise the server would treat it
  // as a replay of the one already created with this key.
  function startNewOrder() {
    formRef.current?.reset();
    setIdempotencyKey(crypto.randomUUID());
    setView({});
    setPreview({ domain: "", count: 1 });
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

  const addresses = preview.count
    ? mailboxAddresses(preview.domain || "your-domain.com", preview.count)
    : [];

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onChange={(e) => setPreview(previewOf(e.currentTarget))}
      noValidate
      className="grid gap-10 lg:grid-cols-[minmax(0,28rem)_1fr]"
    >
      <fieldset disabled={pending} className="flex flex-col gap-6">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Domain
          <Input
            name="domain"
            placeholder="example.com"
            autoComplete="off"
            spellCheck={false}
            className="h-10 bg-surface font-mono"
            aria-invalid={Boolean(errors.domain)}
            aria-describedby="domain-error"
          />
          <FieldError id="domain-error" messages={errors.domain} />
        </label>

        <fieldset className="flex flex-col gap-1.5" aria-describedby="provider-error">
          <legend className="mb-1.5 text-sm font-medium">Provider</legend>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDER_OPTIONS.map((option, i) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-3 py-3 text-sm font-medium",
                  "has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground",
                  "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                )}
              >
                <input
                  type="radio"
                  name="provider"
                  value={option.value}
                  defaultChecked={i === 0}
                  className="accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError id="provider-error" messages={errors.provider} />
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Number of mailboxes
          <Input
            name="mailboxCount"
            type="number"
            min={1}
            max={50}
            defaultValue={1}
            className="h-10 w-28 bg-surface tabular-nums"
            aria-invalid={Boolean(errors.mailboxCount)}
            aria-describedby="mailboxCount-hint mailboxCount-error"
          />
          <span id="mailboxCount-hint" className="font-normal text-muted-foreground">
            From 1 to 50.
          </span>
          <FieldError id="mailboxCount-error" messages={errors.mailboxCount} />
        </label>

        {view.formError && (
          <div role="alert" className="flex flex-col gap-1 border-l-4 border-destructive bg-surface px-4 py-3 text-sm">
            <p>{view.formError}</p>
            {view.existingOrderId && (
              <p className="flex gap-4">
                <Link href={`/orders/${view.existingOrderId}`} className="text-primary underline underline-offset-4">
                  Open that order
                </Link>
                <button type="button" onClick={startNewOrder} className="text-primary underline underline-offset-4">
                  Start a new order
                </button>
              </p>
            )}
          </div>
        )}

        <Button type="submit" size="lg" className="h-10 self-start px-4" disabled={pending}>
          {pending ? "Placing order…" : "Place order"}
        </Button>
      </fieldset>

      <aside className="flex flex-col gap-4 lg:border-l lg:pl-10">
        <h2 className="text-sm font-medium">This order creates</h2>
        {preview.count ? (
          <>
            <RackPreview count={preview.count} />
            <p className="font-mono text-[0.8rem] break-all text-muted-foreground">
              {addresses.length === 1 ? addresses[0] : `${addresses[0]} to ${addresses.at(-1)}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Enter a number of mailboxes from 1 to 50.</p>
        )}
      </aside>
    </form>
  );
}
