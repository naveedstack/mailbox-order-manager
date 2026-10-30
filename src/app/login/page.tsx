import { safeNextPath } from "@/lib/safe-next-path";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-16 w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">Sign in</h1>
      <p className="mb-6 text-sm text-muted-foreground">Mailbox Order Manager</p>
      <LoginForm next={safeNextPath(Array.isArray(next) ? next[0] : next)} />
      {process.env.NODE_ENV !== "production" && (
        <p className="mt-6 text-xs text-muted-foreground">
          Seeded accounts: admin@example.com / Admin123! · alice@example.com / Customer123!
        </p>
      )}
    </div>
  );
}
