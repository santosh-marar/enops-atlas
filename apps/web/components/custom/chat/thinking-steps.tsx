import { ChevronRight, Loader2 } from "lucide-react";
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
        <ol className="mt-1.5 ml-0.5">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            const live = isWorking && last;
            const next = steps[index + 1];
            const duration = next
              ? next.at - step.at
              : live
                ? now - step.at
                : Math.max(
                    0,
                    (thinkingMs ?? 0) - (step.at - (steps[0]?.at ?? step.at))
                  );
            return (
              <li
                className="relative flex items-start gap-3 pb-2.5 text-muted-foreground text-xs last:pb-0"
                key={`${step.at}-${step.label}`}
              >
                {!last && (
                  <span
                    aria-hidden
                    className="absolute top-3.5 bottom-0 left-[5px] w-px bg-border"
                  />
                )}
                <span className="relative mt-0.5 grid size-[11px] shrink-0 place-items-center">
                  {live ? (
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <span className="size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                  )}
                </span>
                <span className={cn("min-w-0 flex-1", live && "animate-pulse")}>
                  {step.label}
                </span>
                {(live || duration >= 1000) && (
                  <span className="shrink-0 text-muted-foreground/70 tabular-nums">
                    {seconds(duration)}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
