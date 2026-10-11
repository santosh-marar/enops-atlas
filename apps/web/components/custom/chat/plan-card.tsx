import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { cn } from "@/lib/utils";
import { SchemaMessages } from "./schema-message";

type Status = NonNullable<ChatMessage["planStatus"]>;

const STATUS: Record<Status, { dot: string; label: string }> = {
  approved: { dot: "bg-emerald-500", label: "Approved" },
  pending: { dot: "bg-amber-500", label: "Awaiting approval" },
  rejected: { dot: "bg-destructive", label: "Rejected" },
};

/** The plan, set off by a rule instead of a box. Open for a decision, folded after. */
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
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-foreground">Schema Plan</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", STATUS[status].dot)} />
          {STATUS[status].label}
        </span>
        {status !== "pending" && (
          <button
            aria-expanded={open}
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? "Hide" : "Show"}
            <ChevronRight
              className={cn("size-3 transition-transform", open && "rotate-90")}
            />
          </button>
        )}
      </div>

      {open && (
        <div className="max-h-80 overflow-y-auto border-border border-l-2 pl-3.5">
          <SchemaMessages content={message.planMarkdown} />
        </div>
      )}

      {status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {message.planOnly ? (
            <p className="text-muted-foreground text-xs">
              Plan mode only plans. Switch to Auto or Build to write the schema.
            </p>
          ) : (
            <Button
              className="h-7 bg-emerald-600 text-white hover:bg-emerald-700"
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
            variant="ghost"
          >
            <X className="mr-1 size-3" />
            Reject
          </Button>
        </div>
      )}
    </section>
  );
}
