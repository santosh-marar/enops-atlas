import { Brain, Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ThinkingStep } from "@/lib/ai/chat-types";

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

/**
 * What the assistant is doing, step by step. While it works the list stays
 * open; afterwards it folds into "Thought for 6s" and can be opened again.
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

  return (
    <div className="rounded-xl border border-border bg-card text-xs">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
        disabled={isWorking}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {isWorking ? (
          <Loader2 className="size-3.5 animate-spin text-primary" />
        ) : (
          <Brain className="size-3.5" />
        )}
        <span className="flex-1 font-medium">
          {isWorking
            ? `Thinking${elapsed ? ` · ${seconds(elapsed)}` : "..."}`
            : `Thought for ${seconds(thinkingMs ?? 0)} · ${steps.length} step${steps.length === 1 ? "" : "s"}`}
        </span>
        {!isWorking && (
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {expanded && steps.length > 0 && (
        <ol className="space-y-1 border-border border-t px-3 py-2">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            return (
              <li
                className="flex items-center gap-2 text-muted-foreground"
                key={`${step.at}-${step.label}`}
              >
                {isWorking && last ? (
                  <Loader2 className="size-3 animate-spin text-primary" />
                ) : (
                  <Check className="size-3 text-green-600 dark:text-green-400" />
                )}
                {step.label}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
