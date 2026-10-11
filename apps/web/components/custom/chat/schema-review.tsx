import {
  Check,
  ChevronRight,
  History,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";

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
          Compare current and proposed DBML
        </summary>
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {[
            { code: message.previousDbml, label: "Current schema" },
            { code: proposal.dbml, label: "Proposed schema" },
          ].map(({ code, label }) => (
            <div className="min-w-0" key={label}>
              <p className="mb-1 text-[11px] text-muted-foreground">{label}</p>
              <pre className="max-h-64 overflow-auto border-border border-l-2 pl-3 font-mono text-[11px] leading-relaxed">
                {code?.trim() || "No schema yet"}
              </pre>
            </div>
          ))}
        </div>
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
