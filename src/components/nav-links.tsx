"use client";
// Client only to read the current path for the active link.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // The most specific match wins, so /orders/new doesn't also light up /orders.
  const active = links
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex h-full items-stretch gap-5 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === active ? "page" : undefined}
          className={cn(
            "flex items-center border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground",
            "aria-[current=page]:border-primary aria-[current=page]:text-foreground",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
