import { RotateCcw } from "lucide-react";
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
        <div className="max-w-[88%] whitespace-pre-wrap break-words bg-muted px-3.5 py-2.5 text-[13px] text-foreground leading-relaxed">
          {message.content}
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
    <div className="group/message min-w-0 space-y-3 text-sm leading-relaxed">
      <ThinkingSteps
        isWorking={busy}
        steps={message.steps ?? []}
        thinkingMs={message.thinkingMs}
      />

      {message.content &&
        (message.phase === "ERROR" ? (
          <p className="whitespace-pre-wrap break-words border-destructive/60 border-l-2 pl-3 text-[13px] text-destructive leading-relaxed">
            {message.content}
          </p>
        ) : message.phase === "ANSWERED" || !message.phase ? (
          <SchemaMessages content={message.content} />
        ) : (
          <p className="wrap-break-word whitespace-pre-wrap text-[13px] text-foreground/90">
            {message.content}
          </p>
        ))}

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
        <button
          className="inline-flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground disabled:opacity-60"
          disabled={isWorking}
          onClick={() => actions.onRetry(message)}
          type="button"
        >
          <RotateCcw className="size-3" />
          Retry
        </button>
      )}
    </div>
  );
}
