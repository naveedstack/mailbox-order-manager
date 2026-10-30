import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";
import { NavLinks } from "./nav-links";

export async function AppHeader() {
  const user = await getSession();
  if (!user) return null;

  const links =
    user.role === "ADMIN"
      ? [{ href: "/admin/orders", label: "All orders" }]
      : [
          { href: "/orders", label: "My orders" },
          { href: "/orders/new", label: "New order" },
        ];

  return (
    <header className="border-b bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-stretch gap-6 px-4 sm:gap-8 sm:px-6">
        <Link href="/" className="type-display flex items-center text-lg font-semibold text-primary">
          Mailbox Orders
        </Link>
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {user.email}
            {user.role === "ADMIN" && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">Admin</span>}
          </span>
          {/* POST form, so logging out works without JS and can't be triggered by a link. */}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
