"use client";
// Calls the retry API; the server decides whether it's allowed. Disabled while
// the request is in flight so a double click can't send two retries.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RetryButton({
  orderId,
  label = "Retry",
  size = "sm",
}: {
  orderId: string;
  label?: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/retry`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Retry failed");
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size={size} variant="outline" onClick={retry} disabled={pending}>
        {pending ? "Retrying…" : label}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
