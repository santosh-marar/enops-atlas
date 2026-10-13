"use client";

import {
  AtSign,
  Columns3,
  Paperclip,
  Settings,
  Table2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { mentionSuggestions } from "@/lib/ai/edit-workflow";
import { ATTACHMENT_ACCEPT, readAttachments } from "@/lib/chat-attachments";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import type { TechStackType } from "./ai-tech-stack-dialog";
import { AddMenu } from "./chat/add-menu";
import { EmptyState } from "./chat/empty-state";
import { ModelPicker, ModePicker, nextMode } from "./chat/execution-controls";
import { MessageBubble } from "./chat/message-bubble";
import { PastedBlockChip } from "./chat/pasted-block-chip";
import { PromptComposer } from "./chat/prompt-composer";
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
  /** Set for attached files; pasted text has none. */
  name?: string;
  text: string;
}

const DATABASE_LABELS: Record<string, string> = {
  mongodb: "MongoDB",
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  sqlite: "SQLite",
};

function stackLabel(stack: TechStackType) {
  const orm =
    stack.orm && !["unknown", "none"].includes(stack.orm)
      ? `${stack.orm[0]?.toUpperCase()}${stack.orm.slice(1)}`
      : null;
  return (
    [DATABASE_LABELS[stack.database] ?? stack.database, orm]
      .filter(Boolean)
      .join(" · ") || "Tech stack"
  );
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const attachFiles = async (files: File[]) => {
    const { attachments, problems } = await readAttachments(
      files,
      pastedBlocks.length
    );
    for (const problem of problems) toast.error(problem);
    if (attachments.length === 0) return;
    setPastedBlocks((previous) => [
      ...previous,
      ...attachments.map((attachment, index) => ({
        ...attachment,
        id: `${Date.now()}-${previous.length + index}`,
      })),
    ]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const startMention = () => {
    setInput((current) =>
      current && !/\s$/.test(current) ? `${current} @` : `${current}@`
    );
    // The menu hands focus back to its trigger as it closes.
    setTimeout(() => inputRef.current?.focus());
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
      <div className="shrink-0 p-3">
        <PromptComposer
          above={
            suggestions.length > 0 ? (
              <div
                aria-label="Mention a table or column"
                className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-56 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
                role="listbox"
              >
                {suggestions.map((name) => {
                  const [table, column] = name.split(".");
                  const Icon = column ? Columns3 : Table2;
                  return (
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                      key={name}
                      onClick={() => insertMention(name)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">
                        {column ?? table}
                      </span>
                      {column && (
                        <span className="ml-auto truncate text-muted-foreground">
                          {table}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : undefined
          }
          actions={
            <ModelPicker
              disabled={isWorking}
              onChange={chat.setPolicy}
              value={chat.policy}
            />
          }
          attachments={
            pastedBlocks.length > 0
              ? pastedBlocks.map((block) => (
                  <PastedBlockChip
                    key={block.id}
                    lineCount={block.lineCount}
                    name={block.name}
                    onRemove={() =>
                      setPastedBlocks((previous) =>
                        previous.filter((item) => item.id !== block.id)
                      )
                    }
                  />
                ))
              : undefined
          }
          busy={isWorking}
          canSubmit={canSend}
          disabled={!techStack}
          footer={
            <>
              <span className="flex min-w-0 items-center gap-1.5 px-2 text-muted-foreground text-xs">
                <span
                  className={`size-1.5 shrink-0 rounded-full ${
                    isWorking
                      ? "animate-pulse bg-primary"
                      : "bg-muted-foreground/50"
                  }`}
                />
                {isWorking ? "Working" : "Ready"}
              </span>
              <Button
                className="h-7 gap-1.5 px-2 font-normal text-muted-foreground text-xs hover:text-foreground"
                onClick={onOpenTechStack}
                title="Update tech stack"
                type="button"
                variant="ghost"
              >
                <Wrench className="size-3.5" />
                {techStack ? stackLabel(techStack) : "Set tech stack"}
              </Button>
            </>
          }
          inputRef={inputRef}
          label="Message the assistant"
          onCycleMode={() =>
            chat.setPolicy({ ...chat.policy, mode: nextMode(chat.policy.mode) })
          }
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onStop={() => {
            chat.stop();
            toast.info("Stopping...");
          }}
          onSubmit={() => handleSubmit()}
          onValueChange={(value) => setInput(value)}
          placeholder={
            techStack
              ? "Describe what to create or change. Type @ to mention a table or column."
              : "Please configure your tech stack first..."
          }
          tools={
            <>
              <AddMenu
                disabled={!techStack}
                items={[
                  {
                    icon: Paperclip,
                    label: "Add files",
                    onSelect: () => fileInputRef.current?.click(),
                    shortcut: "Ctrl U",
                  },
                  {
                    icon: AtSign,
                    label: "Mention a table or column",
                    onSelect: startMention,
                    shortcut: "@",
                  },
                ]}
              />
              <input
                accept={ATTACHMENT_ACCEPT}
                aria-label="Attach schema or text files"
                className="hidden"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length > 0) attachFiles(files);
                }}
                ref={fileInputRef}
                type="file"
              />
              <ModePicker
                disabled={isWorking}
                onChange={chat.setPolicy}
                value={chat.policy}
              />
            </>
          }
          value={input}
        />
      </div>
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
