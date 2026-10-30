import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="type-display text-4xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">This page or order doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        Back to your orders
      </Link>
    </div>
  );
}
