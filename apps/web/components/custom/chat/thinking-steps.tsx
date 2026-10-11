import { Check, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThinkingStep } from "@/lib/ai/chat-types";
import { cn } from "@/lib/utils";

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/**
 * What the assistant is doing, as quiet transcript lines. While it works the
 * list stays open; afterwards it folds into "Thought for 6s · 4 steps".
 */
export function ThinkingSteps({
  isWorking,
  steps,
  thinkingMs,
}: {
  isWorking: boolean;
  steps: ThinkingStep[];
  thinkingMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Ticks only while work is running, so the timer counts up.
  useEffect(() => {
    if (!isWorking) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [isWorking]);

  if (steps.length === 0 && !isWorking) return null;

  const elapsed = steps[0] ? now - steps[0].at : 0;
  const expanded = isWorking || open;
  const summary = isWorking
    ? `Thinking${elapsed ? ` · ${seconds(elapsed)}` : "..."}`
    : `Thought for ${seconds(thinkingMs ?? 0)} · ${steps.length} step${steps.length === 1 ? "" : "s"}`;

  return (
    <div>
      <button
        aria-expanded={expanded}
        className="flex items-center gap-2 py-0.5 text-muted-foreground text-xs hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
        disabled={isWorking}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            isWorking ? "animate-pulse bg-primary" : "bg-emerald-500"
          )}
        />
        <span className={cn(isWorking && "animate-pulse")}>{summary}</span>
        {!isWorking && (
          <ChevronRight
            className={cn("size-3 transition-transform", open && "rotate-90")}
          />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <ol className="mt-1">
          {steps.map((step, index) => {
            const live = isWorking && index === steps.length - 1;
            return (
              <li
                className="flex items-start gap-2.5 py-1 text-muted-foreground text-xs"
                key={`${step.at}-${step.label}`}
              >
                {live ? (
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                ) : (
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                )}
                <span className={cn(live && "animate-pulse")}>
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
