// `?next=` comes from the URL, so only same-origin relative paths are allowed
// (no scheme, no protocol-relative `//host`, no `/\host` that browsers
// normalize to `//host`). Anything else falls back to the home page.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}
