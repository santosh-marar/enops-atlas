import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/ai/chat-types";
import { ClarificationPrompt } from "./clarification-prompt";
import { PlanCard } from "./plan-card";
import { SchemaMessages } from "./schema-message";
import { SchemaApplied, SchemaReview } from "./schema-review";
import { ThinkingSteps } from "./thinking-steps";

export interface MessageActions {
  onAnswer: (message: ChatMessage, answer: string) => void;
  onApply: (message: ChatMessage) => void;
  onApprovePlan: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  onRejectPlan: (message: ChatMessage) => void;
  onRestore: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
}

interface MessageBubbleProps extends MessageActions {
  /** The schema in the editor now. */
  currentDbml: string;
  /** Another message is being worked on, so actions wait. */
  isWorking: boolean;
  message: ChatMessage;
}

const timeLabel = (createdAt?: number) =>
  createdAt
    ? new Date(createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export function MessageBubble({
  currentDbml,
  isWorking,
  message,
  ...actions
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="group/message flex flex-col items-end gap-0.5">
        <div className="max-w-full rounded-2xl bg-primary px-4 py-2 text-primary-foreground text-sm">
          <p className="wrap-break-word whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        <span className="px-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100">
          {timeLabel(message.createdAt)}
        </span>
      </div>
    );
  }

  const busy = message.phase === "WORKING" || message.phase === "GENERATING";
  const failed = message.phase === "ERROR" || message.phase === "STOPPED";
  const review =
    message.phase === "DONE" &&
    message.proposal &&
    !message.applied &&
    !message.discarded;

  return (
    <div className="group/message flex flex-col items-start gap-2">
      <ThinkingSteps
        isWorking={busy}
        steps={message.steps ?? []}
        thinkingMs={message.thinkingMs}
      />

      {message.content && (
        <div
          className={`max-w-full rounded-2xl border px-4 py-2 text-sm ${
            message.phase === "ERROR"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-card"
          }`}
        >
          {message.phase === "ANSWERED" || !message.phase ? (
            <SchemaMessages content={message.content} />
          ) : (
            <p className="wrap-break-word whitespace-pre-wrap">
              {message.content}
            </p>
          )}
        </div>
      )}

      {message.planMarkdown && (
        <PlanCard
          busy={isWorking}
          message={message}
          onApprove={() => actions.onApprovePlan(message)}
          onReject={() => actions.onRejectPlan(message)}
        />
      )}

      {message.phase === "NEEDS_CLARIFICATION" && (
        <ClarificationPrompt
          disabled={isWorking}
          message={message}
          onAnswer={(answer) => actions.onAnswer(message, answer)}
        />
      )}

      {review && (
        <SchemaReview
          busy={isWorking}
          changedSince={currentDbml !== message.previousDbml}
          message={message}
          onApply={() => actions.onApply(message)}
          onDiscard={() => actions.onDiscard(message)}
          onRetry={() => actions.onRetry(message)}
        />
      )}
      {message.applied && (
        <SchemaApplied
          message={message}
          onRestore={() => actions.onRestore(message)}
        />
      )}
      {message.discarded && (
        <p className="text-muted-foreground text-xs">Proposal discarded.</p>
      )}

      {failed && (
        <Button
          disabled={isWorking}
          onClick={() => actions.onRetry(message)}
          size="sm"
          variant="outline"
        >
          <RotateCcw className="mr-1 size-3" />
          Retry
        </Button>
      )}
    </div>
  );
}
