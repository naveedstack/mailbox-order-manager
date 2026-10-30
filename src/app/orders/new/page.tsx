import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { CreateOrderForm } from "./create-order-form";

export default async function NewOrderPage() {
  const user = await requireSession();
  // UX only: the API refuses orders from non-customers anyway.
  if (user.role !== "CUSTOMER") redirect("/admin/orders");

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-sm text-muted-foreground">
          Mailboxes are created as mailbox-01@your-domain, mailbox-02@your-domain, …
        </p>
      </div>
      <CreateOrderForm />
    </div>
  );
}
