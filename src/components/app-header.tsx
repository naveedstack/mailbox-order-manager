import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/server/auth/session";

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
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="font-semibold">
          Mailbox Orders
        </Link>
        <nav className="flex gap-4 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {user.email} <span className="text-xs">({user.role.toLowerCase()})</span>
          </span>
          {/* POST form, so logging out works without JS and can't be triggered by a link. */}
          <form action="/api/auth/logout" method="post">
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
