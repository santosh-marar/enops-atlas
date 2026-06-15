"use client";

import {
  Loader2,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EnhancedSchemaGenPrompt, streamAI } from "@/lib/ai";
import { db } from "@/lib/db";
import type { TechStackType } from "./ai-tech-stack-dialog";
import { getAISettings } from "./api-settings-dialog";
import { SchemaMessages } from "./chat/schema-message";

//  Constants
const MODEL_KEY = "claude-haiku-4-5" as const;
const CONVERSATION_HISTORY_LIMIT = 8;

//  Utils
function extractDBML(content: string): string | null {
  const match = content.match(/```dbml\n([\s\S]*?)\n```/);
  return match?.[1]?.trim() ?? null;
}

//  Types
interface Message {
  content: string;
  id: string;
  role: "user" | "assistant";
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenTechStack: () => void;
  onSchemaGenerated: (dbml: string) => void;
  projectId?: string;
}

//  Component
export function AIChat({
  isOpen,
  onClose,
  onSchemaGenerated,
  onOpenSettings,
  onOpenTechStack,
  projectId,
}: AIChatProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevProjectIdRef = useRef<string | undefined>(undefined);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [techStack, setTechStack] = useState<TechStackType | null>(null);

  // Derived
  const conversationHistory = messages.slice(-CONVERSATION_HISTORY_LIMIT);

  // Load tech stack when panel opens
  useEffect(() => {
    if (!isOpen) return;

    const loadTechStack = async () => {
      try {
        const currentProjectId = localStorage.getItem("current_project_id");
        if (!currentProjectId) return;

        const project = await db.projects.get(currentProjectId);
        setTechStack(project?.techStack ?? null);
      } catch (error) {
        console.error("Failed to load tech stack:", error);
      }
    };

    loadTechStack();
  }, [isOpen]);

  // Load chat history when project changes
  useEffect(() => {
    if (!isOpen) return;

    const loadChatHistory = async () => {
      const projectChanged = prevProjectIdRef.current !== projectId;
      prevProjectIdRef.current = projectId;

      if (!projectId) {
        setMessages([]);
        setTechStack(null);
        return;
      }

      if (projectChanged) {
        setMessages([]);
      }

      try {
        const project = await db.projects.get(projectId);
        if (project?.aiChatHistory?.length) {
          setMessages(project.aiChatHistory);
        } else if (projectChanged) {
          setMessages([]);
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };

    loadChatHistory();
  }, [projectId, isOpen]);

  // Persist chat history on message change
  useEffect(() => {
    if (!projectId || messages.length === 0) return;

    const saveChatHistory = async () => {
      try {
        await db.projects.update(projectId, {
          aiChatHistory: messages,
          updatedAt: new Date(),
        });
      } catch (error) {
        console.error("Failed to save chat history:", error);
      }
    };

    saveChatHistory();
  }, [messages, projectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Guard: settings
    const settings = await getAISettings();
    if (!settings?.vercelAIKey) {
      toast.error("Please configure your API keys first");
      onOpenSettings();
      return;
    }

    // Guard: tech stack
    if (!techStack) {
      toast.error("Please configure your tech stack first");
      onOpenTechStack();
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const aiMessages = [
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: input },
      ];

      const systemPrompt = EnhancedSchemaGenPrompt({
        techStack,
        conversationHistory,
      });

      const result = await streamAI({
        apiKey: settings.vercelAIKey,
        modelKey: MODEL_KEY,
        system: systemPrompt,
        messages: aiMessages,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };
      setMessages((prev) => [...prev, assistantMessage]);

      let fullResponse = "";
      for await (const textPart of result.textStream) {
        fullResponse += textPart;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: fullResponse } : m
          )
        );
      }

      const dbml = extractDBML(fullResponse);
      if (dbml) onSchemaGenerated(dbml);
    } catch (error) {
      console.error("AI generation failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate response"
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!confirm("Clear chat history? This cannot be undone.")) return;

    setMessages([]);

    if (projectId) {
      try {
        await db.projects.update(projectId, {
          aiChatHistory: [],
          updatedAt: new Date(),
        });
        toast.success("Chat history cleared");
      } catch (error) {
        console.error("Failed to clear chat history:", error);
        toast.error("Failed to clear chat history");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && techStack) {
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
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
              onClick={handleClearChat}
              title="Clear Chat History"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            className="rounded-md p-2 transition-colors hover:bg-muted"
            onClick={onOpenTechStack}
            title="Change Tech Stack"
          >
            <Wrench className="h-4 w-4" />
          </button>
          <button
            className="rounded-md p-2 transition-colors hover:bg-muted"
            onClick={onOpenSettings}
            title="AI Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            className="rounded-md p-2 transition-colors hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tech Stack Banner */}
      {techStack && (
        <div className="border-border border-b bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">
              Tech Stack:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                techStack.database,
                techStack.orm,
                techStack.language,
                techStack.backendFramework,
              ].map((item) => (
                <span
                  className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium"
                  key={item}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div
        className="flex-1 space-y-4 overflow-y-auto px-4 py-6"
        ref={chatContainerRef}
      >
        {techStack ? (
          messages.length === 0 ? (
            <EmptyState />
          ) : (
            messages.map((message) => (
              <div
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                key={message.id}
              >
                <div
                  className={`w-full rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card"
                  }`}
                >
                  {message.role === "user" ? (
                    <p className="wrap-break-word whitespace-pre-wrap">
                      {message.content}
                    </p>
                  ) : (
                    <SchemaMessages content={message.content} />
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          <NoTechStackState onOpenTechStack={onOpenTechStack} />
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-muted-foreground">
                Generating schema...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        className="border-border border-t bg-card p-4"
        onSubmit={handleSubmit}
      >
        <div className="flex gap-2">
          <Textarea
            className="resize-none text-sm"
            disabled={isLoading || !techStack}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              techStack
                ? "E.g., Create a SaaS app with user authentication, subscription billing, and team management..."
                : "Please configure your tech stack first..."
            }
            rows={3}
            value={input}
          />
          <Button
            className="h-auto shrink-0"
            disabled={isLoading || !input.trim() || !techStack}
            size="icon"
            type="submit"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-muted-foreground text-xs">
          {techStack ? (
            <>
              <p>Press Enter to send, Shift+Enter for new line</p>
              {messages.length > 0 && <p>{messages.length} messages</p>}
            </>
          ) : (
            <p>Configure tech stack to start using AI assistant</p>
          )}
        </div>
      </form>
    </div>
  );
}

//  Sub-components
function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="rounded-lg border border-border bg-card p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h3 className="mb-2 font-semibold text-base">AI Schema Assistant</h3>
        <p className="mb-4 max-w-sm text-muted-foreground text-sm">
          Describe your application and I will generate a production-ready
          database schema with proper relationships, indexes, and constraints.
        </p>
        <div className="space-y-1.5 text-left text-muted-foreground text-xs">
          {[
            "Foreign key relationships",
            "Optimized indexes",
            "Data constraints",
            "Scalability patterns",
          ].map((feature) => (
            <p className="flex items-center gap-2" key={feature}>
              <span className="text-green-600 dark:text-green-400">✓</span>
              {feature}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

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
