import type { Mailbox } from "@/domain/mailbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";

export function MailboxTable({ mailboxes }: { mailboxes: Mailbox[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Provider id</TableHead>
          <TableHead className="text-right">Attempts</TableHead>
          <TableHead>Last error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mailboxes.map((mailbox) => (
          <TableRow key={mailbox.id}>
            <TableCell className="font-mono text-xs">{mailbox.address}</TableCell>
            <TableCell>
              <StatusBadge status={mailbox.status} />
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{mailbox.externalId ?? "—"}</TableCell>
            <TableCell className="text-right">{mailbox.attempts}</TableCell>
            <TableCell className="text-muted-foreground">{mailbox.lastError ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
