"use client";

import { ArrowUp, Settings, Square, Trash2, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { mentionSuggestions } from "@/lib/ai/edit-workflow";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import type { TechStackType } from "./ai-tech-stack-dialog";
import { EmptyState } from "./chat/empty-state";
import { ExecutionControls } from "./chat/execution-controls";
import { MessageBubble } from "./chat/message-bubble";
import { PastedBlockChip } from "./chat/pasted-block-chip";
import { useChatSession } from "./chat/use-chat-session";

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenTechStack: () => void;
  onSchemaGenerated: (dbml: string) => void;
  projectId?: string;
}

interface PastedBlock {
  id: string;
  lineCount: number;
  text: string;
}

// Pastes longer than this collapse into a chip instead of filling the textarea.
const PASTE_LINE_THRESHOLD = 12;

export function AIChat({
  isOpen,
  onClose,
  onSchemaGenerated,
  onOpenSettings,
  onOpenTechStack,
  projectId,
}: AIChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stays true until the reader scrolls up, so new text doesn't pull them down.
  const pinnedRef = useRef(true);
  const [input, setInput] = useState("");
  const [pastedBlocks, setPastedBlocks] = useState<PastedBlock[]>([]);
  const [techStack, setTechStack] = useState<TechStackType | null>(null);
  const dbml = useSchemaStore((state) => state.dbml);

  const chat = useChatSession({
    dbml,
    isOpen,
    onNeedSettings: onOpenSettings,
    onSchemaGenerated,
    projectId,
    techStack: techStack ? { ...techStack } : null,
  });
  const { isWorking, messages } = chat;

  // Load tech stack when panel opens or the project changes.
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        const id = projectId ?? localStorage.getItem("current_project_id");
        if (!id) {
          setTechStack(null);
          return;
        }
        const project = await db.projects.get(id);
        setTechStack(project?.techStack ?? null);
      } catch (error) {
        console.error("Failed to load tech stack:", error);
      }
    };
    load();
  }, [isOpen, projectId]);

  // Keep the newest message, and the step being worked on, in view.
  const lastSteps = messages.at(-1)?.steps?.length ?? 0;
  useEffect(() => {
    const element = scrollRef.current;
    if (element && pinnedRef.current) element.scrollTop = element.scrollHeight;
  }, [messages.length, lastSteps, isWorking]);

  const canSend =
    Boolean(techStack) &&
    !isWorking &&
    (input.trim().length > 0 || pastedBlocks.length > 0);

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSend) return;
    // The model sees the typed text and the pasted blocks; the bubble stays short.
    const text = [input.trim(), ...pastedBlocks.map((block) => block.text)]
      .filter(Boolean)
      .join("\n\n");
    setInput("");
    setPastedBlocks([]);
    chat.sendMessage(text);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData("text");
    const lineCount = text.split("\n").length;
    if (lineCount <= PASTE_LINE_THRESHOLD) return;
    event.preventDefault();
    setPastedBlocks((previous) => [
      ...previous,
      { id: `${Date.now()}-${previous.length}`, lineCount, text },
    ]);
  };

  // "@po" suggests tables and columns that exist.
  const mention = /@([\w.]*)$/.exec(input);
  const suggestions = mention ? mentionSuggestions(dbml, mention[1] ?? "") : [];
  const insertMention = (name: string) =>
    setInput((current) => current.replace(/@[\w.]*$/, `${name} `));

  const handleClear = () => {
    if (confirm("Clear chat history? This cannot be undone.")) chat.clear();
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-border border-b px-4">
        <h2 className="font-medium text-sm">AI Assistant</h2>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <Button
              aria-label="Clear chat history"
              className="size-8 hover:text-destructive"
              onClick={handleClear}
              size="icon"
              title="Clear Chat History"
              type="button"
              variant="ghost"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            aria-label="AI Settings"
            className="size-8"
            onClick={onOpenSettings}
            size="icon"
            title="AI Settings"
            type="button"
            variant="ghost"
          >
            <Settings className="size-4" />
          </Button>
          <Button
            aria-label="Close"
            className="size-8"
            onClick={onClose}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          pinnedRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
        }}
        ref={scrollRef}
      >
        <div className="flex min-h-full flex-col gap-6 px-5 py-6">
          {techStack ? (
            messages.length === 0 ? (
              <EmptyState onPick={setInput} />
            ) : (
              messages.map((message) => (
                <MessageBubble
                  currentDbml={dbml}
                  isWorking={isWorking}
                  key={message.id}
                  message={message}
                  onAnswer={chat.answerQuestion}
                  onApply={chat.applyProposal}
                  onApprovePlan={chat.approvePlan}
                  onDiscard={chat.discardProposal}
                  onRejectPlan={chat.rejectPlan}
                  onRestore={chat.restoreCheckpoint}
                  onRetry={chat.retry}
                />
              ))
            )
          ) : (
            <NoTechStackState onOpenTechStack={onOpenTechStack} />
          )}
        </div>
      </div>

      {/* Composer */}
      <form className="shrink-0 p-3" onSubmit={handleSubmit}>
        {suggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {suggestions.map((name) => (
              <button
                className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                key={name}
                onClick={() => insertMention(name)}
                type="button"
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-xl border border-border bg-card shadow-sm transition-colors focus-within:border-primary/50">
          {pastedBlocks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
              {pastedBlocks.map((block) => (
                <PastedBlockChip
                  key={block.id}
                  lineCount={block.lineCount}
                  onRemove={() =>
                    setPastedBlocks((previous) =>
                      previous.filter((item) => item.id !== block.id)
                    )
                  }
                />
              ))}
            </div>
          )}
          <textarea
            aria-label="Message the assistant"
            className="block max-h-60 min-h-[3.25rem] w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm leading-relaxed outline-none [field-sizing:content] placeholder:text-muted-foreground disabled:opacity-60"
            disabled={isWorking || !techStack}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
            onPaste={handlePaste}
            placeholder={
              techStack
                ? "Describe what to create or change. Type @ to mention a table or column."
                : "Please configure your tech stack first..."
            }
            rows={2}
            value={input}
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <Button
              aria-label="Update tech stack"
              className="size-8"
              onClick={onOpenTechStack}
              size="icon"
              title="Update tech stack"
              type="button"
              variant="ghost"
            >
              <Wrench className="size-4" />
            </Button>
            <ExecutionControls
              disabled={isWorking}
              onChange={chat.setPolicy}
              value={chat.policy}
            />
            <div className="ml-auto">
              {isWorking ? (
                <Button
                  aria-label="Stop"
                  className="size-8 rounded-full"
                  onClick={() => {
                    chat.stop();
                    toast.info("Stopping...");
                  }}
                  size="icon"
                  title="Stop"
                  type="button"
                  variant="secondary"
                >
                  <Square className="size-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  aria-label="Send"
                  className="size-8 rounded-full"
                  disabled={!canSend}
                  size="icon"
                  title="Send (Enter). Shift+Enter for a new line"
                  type="submit"
                >
                  <ArrowUp className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

//  Sub-components
function NoTechStackState({
  onOpenTechStack,
}: {
  onOpenTechStack: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-1">
      <div>
        <h3 className="font-medium text-base">Set your tech stack first</h3>
        <p className="mt-1 max-w-sm text-muted-foreground text-sm">
          The assistant writes schemas that match your database, ORM and
          language, so it needs to know them before it starts.
        </p>
      </div>
      <div>
        <Button onClick={onOpenTechStack} size="sm">
          <Wrench className="mr-2 size-4" />
          Configure Tech Stack
        </Button>
      </div>
    </div>
  );
}
