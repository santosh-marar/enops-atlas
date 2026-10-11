import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage } from "@/lib/ai/chat-types";

function AnswerBox({ onSubmit }: { onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  const submit = () => {
    const text = value.trim();
    if (text) onSubmit(text);
  };
  return (
    <div className="flex items-end gap-2">
      <Textarea
        className="min-h-9 resize-none text-xs"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Type your answer"
        rows={1}
        value={value}
      />
      <Button
        className="h-8"
        disabled={!value.trim()}
        onClick={submit}
        size="sm"
        type="button"
      >
        Answer
      </Button>
    </div>
  );
}

/** A question from the assistant. It freezes, showing the answer, once answered. */
export function ClarificationPrompt({
  disabled,
  message,
  onAnswer,
}: {
  disabled: boolean;
  message: ChatMessage;
  onAnswer: (answer: string) => void;
}) {
  const { question } = message;
  if (!question) return null;
  const answered = message.answeredValue;
  const answer = (value: string) => {
    if (!(answered || disabled)) onAnswer(value);
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="mb-2 font-medium text-xs">{question.text}</p>
      <div className="space-y-2">
        {(question.options ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(question.options ?? []).map((option) => {
              const selected = answered === option;
              return (
                <Button
                  className={`h-7 text-xs ${answered && !selected ? "opacity-40" : ""}`}
                  disabled={Boolean(answered) || disabled}
                  key={option}
                  onClick={() => answer(option)}
                  size="sm"
                  variant={selected ? "default" : "outline"}
                >
                  {selected && <Check className="mr-1 size-3" />}
                  {option}
                </Button>
              );
            })}
          </div>
        )}
        {!answered && (
          <div className="space-y-1">
            {(question.options ?? []).length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Or type your own answer:
              </p>
            )}
            <AnswerBox onSubmit={answer} />
          </div>
        )}
      </div>
      {answered && (
        <p className="mt-2 flex items-center gap-1.5 text-emerald-700 text-xs dark:text-emerald-400">
          <Check className="size-3.5" /> You answered: {answered}
        </p>
      )}
    </div>
  );
}
