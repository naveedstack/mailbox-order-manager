import type { Mailbox } from "@/domain/mailbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mailboxAnchor, slotNumber } from "./mailbox-rack";
import { StatusBadge } from "./status-badge";

// Rows carry the rack's slot numbers and anchors, so a slot jumps to its row.
// `provisioning`: the order is being worked on, so pending rows are in progress.
export function MailboxTable({ mailboxes, provisioning }: { mailboxes: Mailbox[]; provisioning: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Slot</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Provider ID</TableHead>
          <TableHead className="text-right">Attempts</TableHead>
          <TableHead>Last error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {mailboxes.map((mailbox, i) => (
          <TableRow key={mailbox.id} id={mailboxAnchor(i)} className="scroll-mt-24 target:bg-accent">
            <TableCell className="font-mono text-xs text-muted-foreground tabular-nums">{slotNumber(i)}</TableCell>
            <TableCell className="font-mono text-[0.8rem] whitespace-nowrap">{mailbox.address}</TableCell>
            <TableCell>
              <StatusBadge status={provisioning && mailbox.status === "PENDING" ? "PROVISIONING" : mailbox.status} />
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{mailbox.externalId ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{mailbox.attempts}</TableCell>
            <TableCell className="min-w-56 text-muted-foreground">{mailbox.lastError ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
