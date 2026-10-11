import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { SchemaMessages } from "./schema-message";

type Status = NonNullable<ChatMessage["planStatus"]>;

const BADGE: Record<Status, { className: string; label: string }> = {
  approved: {
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
    label: "Approved",
  },
  pending: {
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    label: "Awaiting approval",
  },
  rejected: {
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    label: "Rejected",
  },
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge className={BADGE[status].className} variant="secondary">
      {BADGE[status].label}
    </Badge>
  );
}

/** The plan: open for a decision, and folded once it has been decided. */
export function PlanCard({
  busy,
  message,
  onApprove,
  onReject,
}: {
  busy: boolean;
  message: ChatMessage;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status = message.planStatus ?? "pending";
  const [open, setOpen] = useState(status === "pending");
  if (!message.planMarkdown) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-border border-b bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Schema Plan</span>
          <StatusBadge status={status} />
        </div>
        {status !== "pending" && (
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? "Hide" : "Show"}
            {open ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        )}
      </div>

      {open && (
        <div className="max-h-80 overflow-y-auto px-3.5 py-3">
          <SchemaMessages content={message.planMarkdown} />
        </div>
      )}

      {status === "pending" && (
        <div className="flex items-center justify-between gap-2 border-border border-t bg-muted/40 px-3.5 py-2.5">
          {message.planOnly ? (
            <p className="text-muted-foreground text-xs">
              Plan mode only plans. Switch to Auto or Build to write the schema.
            </p>
          ) : (
            <Button
              className="h-7 bg-green-600 text-white hover:bg-green-700"
              disabled={busy}
              onClick={onApprove}
              size="sm"
            >
              <Check className="mr-1 size-3" />
              Approve & Generate
            </Button>
          )}
          <Button
            className="h-7"
            disabled={busy}
            onClick={onReject}
            size="sm"
            variant="outline"
          >
            <X className="mr-1 size-3" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
