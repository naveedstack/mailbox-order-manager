import type { AuditEntry } from "@/domain/order";
import { formatDateTime } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";

export function AuditLogTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Transition</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</TableCell>
            <TableCell className="whitespace-nowrap">
              <span className="inline-flex items-center gap-1.5">
                {entry.fromStatus ? <StatusBadge status={entry.fromStatus} /> : <span className="text-muted-foreground">created</span>}
                <span aria-hidden>→</span>
                <StatusBadge status={entry.toStatus} />
              </span>
            </TableCell>
            <TableCell>
              {entry.actorType === "SYSTEM" ? (
                <span className="text-muted-foreground">system (worker)</span>
              ) : (
                <span>
                  {entry.actorEmail ?? "unknown user"}{" "}
                  <span className="text-xs text-muted-foreground">({entry.actorType.toLowerCase()})</span>
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">{entry.reason ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
