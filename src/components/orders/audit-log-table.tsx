// The audit log as a timeline, oldest first: it is a sequence, so a rail with
// one marker per transition reads better than a table.
import type { AuditEntry } from "@/domain/order";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./labels";
import { STATUS_TEXT } from "./status-badge";

function actorText(entry: AuditEntry): string {
  if (entry.actorType === "SYSTEM") return "Worker";
  const who = entry.actorEmail ?? "Unknown user";
  return entry.actorType === "ADMIN" ? `${who} (admin)` : who;
}

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-5 border-l-2 border-border pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 -left-[calc(1.5rem+6px)] size-2.5 rounded-full bg-current ring-4 ring-background",
              STATUS_TEXT[entry.toStatus],
            )}
          />
          <p className="text-sm">
            {entry.fromStatus ? (
              <>
                <span className={cn("font-medium", STATUS_TEXT[entry.fromStatus])}>{STATUS_LABEL[entry.fromStatus]}</span>
                <span className="text-muted-foreground"> to </span>
              </>
            ) : (
              <span className="text-muted-foreground">Created as </span>
            )}
            <span className={cn("font-medium", STATUS_TEXT[entry.toStatus])}>{STATUS_LABEL[entry.toStatus]}</span>
            {entry.reason && <span className="text-foreground">: {entry.reason}</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <time dateTime={entry.createdAt.toISOString()}>{formatDateTime(entry.createdAt)}</time>
{" by "}
            {actorText(entry)}
          </p>
        </li>
      ))}
    </ol>
  );
}
