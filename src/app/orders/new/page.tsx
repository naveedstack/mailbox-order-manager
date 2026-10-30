import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { CreateOrderForm } from "./create-order-form";

export default async function NewOrderPage() {
  const user = await requireSession();
  // UX only: the API refuses orders from non-customers anyway.
  if (user.role !== "CUSTOMER") redirect("/admin/orders");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-xl flex-col gap-2">
        <h1 className="type-display text-4xl font-semibold">New order</h1>
        <p className="text-muted-foreground">
          Choose a domain, a provider and how many mailboxes you need. You can follow provisioning on
          the order page.
        </p>
      </div>
      <CreateOrderForm />
    </div>
  );
}
