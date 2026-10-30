import { safeNextPath } from "@/lib/safe-next-path";
import { LoginForm } from "./login-form";

const SEEDED_ACCOUNTS = [
  { email: "admin@example.com", password: "Admin123!", role: "Admin" },
  { email: "alice@example.com", password: "Customer123!", role: "Customer" },
  { email: "bob@example.com", password: "Customer123!", role: "Customer" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8 pt-8 sm:pt-16">
      <div className="flex flex-col gap-2">
        <h1 className="type-display text-4xl font-semibold text-primary">Mailbox Orders</h1>
        <p className="text-muted-foreground">Sign in to order mailboxes and follow their provisioning.</p>
      </div>
      <div className="rounded-lg border bg-surface p-6">
        <LoginForm next={safeNextPath(Array.isArray(next) ? next[0] : next)} />
      </div>
      
    </div>
  );
}
