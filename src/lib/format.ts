// Server-rendered timestamps in a fixed format and zone, so output doesn't
// depend on the server's locale.
export function formatDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
