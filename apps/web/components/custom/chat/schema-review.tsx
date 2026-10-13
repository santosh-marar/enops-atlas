import {
  Check,
  ChevronRight,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { type ProposalChange, proposalChanges } from "@/lib/proposal-changes";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ProposalChange["kind"], string> = {
  added: "New",
  changed: "Changed",
  removed: "Removed",
};

function DbmlBlock({ code, label }: { code?: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto border-border border-l-2 pl-3 font-mono text-[11px] leading-relaxed">
        {code?.trim() || "No schema yet"}
      </pre>
    </div>
  );
}

/** Only the tables and enums the proposal touches, each before and after. */
function ChangedBlocks({ changes }: { changes: ProposalChange[] }) {
  if (changes.length === 0) {
    return (
      <p className="mt-2 text-muted-foreground text-xs">
        No tables or enums change.
      </p>
    );
  }
  return (
    <div className="mt-2 space-y-3">
      {changes.map((change) => (
        <div key={`${change.type}:${change.name}`}>
          <p className="mb-1 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "px-1 font-medium text-[10px] uppercase",
                change.kind === "added" &&
                  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                change.kind === "changed" &&
                  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                change.kind === "removed" &&
                  "bg-destructive/15 text-destructive"
              )}
            >
              {KIND_LABEL[change.kind]}
            </span>
            <span className="font-mono">{change.name}</span>
            {change.type === "enum" && (
              <span className="text-muted-foreground">enum</span>
            )}
          </p>
          <div
            className={cn(
              "grid gap-3",
              change.kind === "changed" && "lg:grid-cols-2"
            )}
          >
            {change.kind !== "added" && (
              <DbmlBlock code={change.before} label="Current" />
            )}
            {change.kind !== "removed" && (
              <DbmlBlock code={change.after} label="Proposed" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The written schema, waiting for the user to apply or discard it. */
export function SchemaReview({
  busy,
  changedSince,
  message,
  onApply,
  onDiscard,
  onRetry,
}: {
  busy: boolean;
  /** The editor no longer holds the schema this was written against. */
  changedSince: boolean;
  message: ChatMessage;
  onApply: () => void;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const { proposal } = message;
  // Null when either side cannot be read; the full schemas are shown then.
  const changes = useMemo(() => {
    if (!proposal) return null;
    try {
      return proposalChanges(message.previousDbml ?? "", proposal.dbml);
    } catch {
      return null;
    }
  }, [message.previousDbml, proposal]);
  if (!proposal) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="font-medium text-[13px]">Review schema proposal</p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          Your schema stays unchanged until you apply this. A checkpoint is
          saved first so you can go back.
        </p>
      </div>

      {proposal.problems.length > 0 && (
        <div className="space-y-1 border-destructive/60 border-l-2 pl-3.5">
          <p className="font-medium text-xs">Why it can't be applied</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-xs">
            {proposal.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {proposal.outsidePlan.length > 0 && (
        <div className="space-y-1 border-amber-500/70 border-l-2 pl-3.5">
          <p className="font-medium text-xs">Changes that need attention</p>
          <p className="text-muted-foreground text-xs">
            It also changes {proposal.outsidePlan.join(", ")}, which were not in
            the plan.
          </p>
        </div>
      )}

      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground text-xs hover:text-foreground">
          <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
          {changes
            ? `Compare changes (${changes.length} ${changes.length === 1 ? "item" : "items"})`
            : "Compare current and proposed DBML"}
        </summary>
        {changes ? (
          <ChangedBlocks changes={changes} />
        ) : (
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <DbmlBlock code={message.previousDbml} label="Current schema" />
            <DbmlBlock code={proposal.dbml} label="Proposed schema" />
          </div>
        )}
      </details>

      {proposal.attempts > 1 && (
        <p className="text-muted-foreground text-xs">
          It took {proposal.attempts} attempts to get a valid schema.
        </p>
      )}
      {changedSince && (
        <p className="text-amber-700 text-xs dark:text-amber-400">
          The schema changed after this was written. Retry to write it against
          the current one.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="h-7"
          disabled={busy || !proposal.valid || changedSince}
          onClick={onApply}
          size="sm"
        >
          {busy ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Check className="mr-1 size-3" />
          )}
          {proposal.outsidePlan.length > 0 ? "Apply anyway" : "Apply proposal"}
        </Button>
        <Button
          className="h-7"
          disabled={busy}
          onClick={onRetry}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="mr-1 size-3" />
          Retry
        </Button>
        <Button
          className="h-7"
          disabled={busy}
          onClick={onDiscard}
          size="sm"
          variant="ghost"
        >
          <X className="mr-1 size-3" />
          Discard
        </Button>
      </div>
    </section>
  );
}

/** After applying: where the checkpoint is, and a way back. */
export function SchemaApplied({
  message,
  onRestore,
}: {
  message: ChatMessage;
  onRestore: () => void;
}) {
  return (
    <div className="space-y-1.5 text-xs">
      <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
        <Check className="size-3.5" />
        {message.restored
          ? "Restored the schema from before this change."
          : "Applied to the editor."}
      </p>
      {message.checkpoint ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <History className="size-3.5" />
          Checkpoint v{message.checkpoint} saved. Find it in Action &gt; Version
          History.
        </p>
      ) : null}
      {!message.restored && (
        <button
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onRestore}
          title="Put the schema back as it was before this change"
          type="button"
        >
          <RotateCcw className="size-3" />
          Restore previous schema
        </button>
      )}
    </div>
  );
}
