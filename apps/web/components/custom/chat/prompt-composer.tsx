"use client";

import { ArrowUp, Loader2, Square } from "lucide-react";
import type {
  ClipboardEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The chat composer, the same one Enops Cloud uses: a field with tools on the left and model controls + send on the right,
 * inside a muted shell whose footer manages the agent itself.
 */
export function PromptComposer({
  above,
  actions,
  attachments,
  busy = false,
  canSubmit,
  className,
  disabled = false,
  footer,
  inputRef,
  label = "Message",
  onBlur,
  onCycleMode,
  onKeyDown,
  onPaste,
  onStop,
  onSubmit,
  onValueChange,
  placeholder,
  sending = false,
  stopping = false,
  submitLabel = "Send",
  tools,
  value,
}: {
  /** Floating menus (slash commands, mentions) anchored above the field. */
  above?: ReactNode;
  /** Right of the field, before send: model and effort. */
  actions?: ReactNode;
  /** Chips above the text: attached files, pasted blocks. */
  attachments?: ReactNode;
  /** The agent is working; send becomes stop when onStop is given. */
  busy?: boolean;
  /** Overrides the default "has text, not busy" rule. */
  canSubmit?: boolean;
  className?: string;
  disabled?: boolean;
  /** Row under the field for managing the agent: status, runs. */
  footer?: ReactNode;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  label?: string;
  onBlur?: () => void;
  /** Alt+M: switch to the next mode. */
  onCycleMode?: () => void;
  /** Runs first; call preventDefault to take over the key. */
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onStop?: () => void;
  onSubmit: () => void;
  onValueChange: (value: string, cursor: number) => void;
  placeholder?: string;
  sending?: boolean;
  stopping?: boolean;
  submitLabel?: string;
  /** Left of the field's bottom row: mode, attach. */
  tools?: ReactNode;
  value: string;
}) {
  const ready =
    canSubmit ?? (value.trim().length > 0 && !busy && !sending && !disabled);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    // Never submit while an IME is composing (Hindi, Japanese, Chinese…).
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (onCycleMode && event.altKey && event.code === "KeyM") {
      event.preventDefault();
      onCycleMode();
      return;
    }
    if (event.key === "Escape" && busy && onStop) {
      event.preventDefault();
      onStop();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (ready) onSubmit();
    }
  }

  return (
    <div
      className={cn("shrink-0 rounded-xl border bg-muted/40 p-1", className)}
    >
      <div className="relative rounded-lg border border-border bg-card shadow-sm transition-colors focus-within:border-primary/50">
        {above}
        {attachments && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {attachments}
          </div>
        )}
        <textarea
          aria-label={label}
          className="block max-h-60 min-h-[3.25rem] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-60"
          disabled={disabled}
          onBlur={onBlur}
          onChange={(event) =>
            onValueChange(
              event.target.value,
              event.target.selectionStart ?? event.target.value.length
            )
          }
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          ref={inputRef}
          rows={2}
          value={value}
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <div className="flex min-w-0 items-center gap-0.5">{tools}</div>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            {actions}
            {busy && onStop ? (
              <Button
                aria-label="Stop"
                className="ml-1 h-7 w-7 rounded-full"
                disabled={stopping}
                onClick={onStop}
                size="icon"
                title="Stop (Esc)"
                type="button"
                variant="secondary"
              >
                {stopping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3 w-3 fill-current" />
                )}
              </Button>
            ) : (
              <Button
                aria-label={submitLabel}
                className="ml-1 h-7 w-7 rounded-full"
                disabled={!ready}
                onClick={onSubmit}
                size="icon"
                title={`${submitLabel} (Enter) · Shift+Enter for a new line`}
                type="button"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
      {footer && (
        <div className="flex min-h-7 items-center justify-between gap-2 pt-1">
          {footer}
        </div>
      )}
    </div>
  );
}
