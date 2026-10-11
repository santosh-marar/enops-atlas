"use client";

import {
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    if (element) element.scrollTop = element.scrollHeight;
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
      <div className="flex items-center justify-between border-border border-b bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">AI Schema Assistant</h2>
            <p className="text-muted-foreground text-xs">
              Production-ready schemas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              className="rounded-md p-2 transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClear}
              title="Clear Chat History"
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            className="rounded-md p-2 transition-colors hover:bg-muted"
            onClick={onOpenSettings}
            title="AI Settings"
            type="button"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            aria-label="Close"
            className="rounded-md p-2 transition-colors hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 space-y-4 overflow-y-auto px-4 py-6"
        ref={scrollRef}
      >
        {techStack ? (
          messages.length === 0 ? (
            <EmptyState />
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

      {/* Input */}
      <form
        className="border-border border-t bg-background p-3"
        onSubmit={handleSubmit}
      >
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
        <div className="rounded-2xl border border-border bg-card shadow-sm transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
          {pastedBlocks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
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
          <Textarea
            className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-3 pt-3 text-sm shadow-none focus-visible:ring-0"
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
          <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
            <button
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={onOpenTechStack}
              title="Update tech stack"
              type="button"
            >
              <Wrench className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <ExecutionControls
                disabled={isWorking}
                onChange={chat.setPolicy}
                value={chat.policy}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isWorking ? (
                <Button
                  aria-label="Stop"
                  className="h-9 w-9 rounded-full"
                  onClick={() => {
                    chat.stop();
                    toast.info("Stopping...");
                  }}
                  size="icon"
                  title="Stop"
                  type="button"
                  variant="outline"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  aria-label="Send"
                  className="h-9 w-9 rounded-full"
                  disabled={!canSend}
                  size="icon"
                  title="Send (Enter). Shift+Enter for a new line"
                  type="submit"
                >
                  <Send className="h-4 w-4" />
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
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="max-w-md rounded-lg border border-orange-500/50 bg-orange-500/10 p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/20">
          <Wrench className="h-6 w-6 text-orange-600 dark:text-orange-400" />
        </div>
        <h3 className="mb-2 font-semibold text-base text-orange-900 dark:text-orange-100">
          Tech Stack Required
        </h3>
        <p className="mb-4 text-orange-800 text-sm dark:text-orange-200">
          Before using the AI assistant, please configure your project&apos;s
          tech stack. This ensures the generated schema matches your
          authentication library, database, and other requirements.
        </p>
        <Button
          className="bg-orange-600 text-white hover:bg-orange-700"
          onClick={onOpenTechStack}
        >
          <Wrench className="mr-2 h-4 w-4" />
          Configure Tech Stack
        </Button>
      </div>
    </div>
  );
}
