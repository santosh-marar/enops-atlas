import { Check, History, Loader2, RotateCcw, X } from "lucide-react";
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
    <div className="mt-2 space-y-3 rounded-xl border bg-card p-3">
      <p className="font-medium text-sm">Review schema proposal</p>
      <p className="text-muted-foreground text-xs">
        Your schema stays unchanged until you apply this. A checkpoint is saved
        first so you can go back.
      </p>

      {proposal.problems.length > 0 && (
        <div className="space-y-1 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
          <p className="font-medium text-xs">Why it can't be applied</p>
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {proposal.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {proposal.outsidePlan.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="font-medium text-xs">Changes that need attention</p>
          <p className="text-xs">
            It also changes {proposal.outsidePlan.join(", ")}, which were not in
            the plan.
          </p>
        </div>
      )}

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-3 py-2 text-xs">
          Compare current and proposed DBML
        </summary>
        <div className="grid gap-2 border-t p-2 lg:grid-cols-2">
          {[
            { code: message.previousDbml, label: "Current schema" },
            { code: proposal.dbml, label: "Proposed schema" },
          ].map(({ code, label }) => (
            <div className="min-w-0" key={label}>
              <p className="mb-1 font-medium text-xs">{label}</p>
              <pre className="max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
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
        <Button disabled={busy} onClick={onRetry} size="sm" variant="outline">
          <RotateCcw className="mr-1 size-3" />
          Retry
        </Button>
        <Button disabled={busy} onClick={onDiscard} size="sm" variant="ghost">
          <X className="mr-1 size-3" />
          Discard
        </Button>
      </div>
    </div>
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
    <div className="mt-2 space-y-2 rounded-lg border border-green-500/50 bg-green-500/10 px-3 py-2">
      <p className="flex items-center gap-2 text-green-700 text-xs dark:text-green-300">
        <Check className="size-4" />
        {message.restored
          ? "Restored the schema from before this change."
          : "Applied to the editor."}
      </p>
      {message.checkpoint ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <History className="size-3.5" />
          Checkpoint v{message.checkpoint} saved. Find it in Action &gt; Version
          History.
        </p>
      ) : null}
      {!message.restored && (
        <Button onClick={onRestore} size="sm" variant="outline">
          <RotateCcw className="mr-1 size-3" />
          Restore previous schema
        </Button>
      )}
    </div>
  );
}
