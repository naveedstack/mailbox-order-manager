// The order's mailboxes as a sorting rack: one numbered slot per mailbox,
// filled by status. Status is carried by shape as well as colour (empty,
// solid, hatched, dashed), and each slot names its address for screen readers.
import type { Mailbox } from "@/domain/mailbox";
import type { MailboxStatus } from "@/domain/types";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./labels";

type SlotState = MailboxStatus | "WORKING" | "PREVIEW";

const SLOT: Record<SlotState, string> = {
  PREVIEW: "border-input bg-surface text-muted-foreground",
  PENDING: "border-status-pending/60 bg-surface text-status-pending",
  WORKING: "border-dashed border-status-provisioning bg-surface text-status-provisioning",
  ACTIVE: "border-status-active bg-status-active text-white",
  FAILED:
    "border-status-failed text-white bg-status-failed bg-[repeating-linear-gradient(-45deg,transparent_0_5px,rgb(255_255_255/0.22)_5px_7px)]",
};

export const slotNumber = (index: number) => String(index + 1).padStart(2, "0");
export const mailboxAnchor = (index: number) => `mailbox-${slotNumber(index)}`;

function Slot({ index, state, label, href }: { index: number; state: SlotState; label?: string; href?: string }) {
  const className = cn(
    "flex size-11 items-center justify-center rounded-md border-2 font-mono text-xs font-medium tabular-nums",
    SLOT[state],
    state === "WORKING" && "motion-safe:animate-status-pulse",
    href && "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 hover:brightness-95",
  );
  return href ? (
    <a href={href} aria-label={label} title={label} className={className}>
      {slotNumber(index)}
    </a>
  ) : (
    <span aria-hidden className={className}>
      {slotNumber(index)}
    </span>
  );
}

// Fixed-size slots that wrap: ten to a row where there is room (10 x 44px + gaps).
const GRID = "flex max-w-[33rem] flex-wrap gap-2";

// `provisioning`: the order is being worked on, so its pending slots are in progress.
export function MailboxRack({ mailboxes, provisioning }: { mailboxes: Mailbox[]; provisioning: boolean }) {
  const count = (status: MailboxStatus) => mailboxes.filter((m) => m.status === status).length;
  const legend: { state: SlotState; text: string }[] = [
    { state: "ACTIVE", text: `${count("ACTIVE")} active` },
    { state: "FAILED", text: `${count("FAILED")} failed` },
    {
      state: provisioning ? "WORKING" : "PENDING",
      text: `${count("PENDING")} ${provisioning ? "provisioning" : "pending"}`,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ol className={GRID}>
        {mailboxes.map((mailbox, i) => {
          const state = mailbox.status === "PENDING" && provisioning ? "WORKING" : mailbox.status;
          return (
            <li key={mailbox.id}>
              <Slot
                index={i}
                state={state}
                href={`#${mailboxAnchor(i)}`}
                label={`${mailbox.address}: ${provisioning && mailbox.status === "PENDING" ? "Provisioning" : STATUS_LABEL[mailbox.status]}`}
              />
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {legend.map(({ state, text }) => (
          <li key={state} className="flex items-center gap-2">
            <span aria-hidden className={cn("size-3 rounded-sm border-2", SLOT[state])} />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Empty slots for the create form: how many mailboxes this order will get.
export function RackPreview({ count }: { count: number }) {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Slot key={i} index={i} state="PREVIEW" />
      ))}
    </div>
  );
}
