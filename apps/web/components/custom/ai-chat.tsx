"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Loader2,
  X,
  Settings,
  Sparkles,
  Wrench,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAISettings } from "./api-settings-dialog";
import type { TechStack } from "./ai-tech-stack-dialog";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { SYSTEM_PROMPT } from "@/ai/prompt/system-prompt";

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onSchemaGenerated: (dbml: string) => void;
  onOpenSettings: () => void;
  onOpenTechStack: () => void;
  projectId?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIChat({
  isOpen,
  onClose,
  onSchemaGenerated,
  onOpenSettings,
  onOpenTechStack,
  projectId,
}: AIChatProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [techStack, setTechStack] = useState<TechStack | null>(null);
  const prevProjectIdRef = useRef<string | undefined>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);

    const loadTechStack = async () => {
      try {
        const currentProjectId = localStorage.getItem("current_project_id");
        if (!currentProjectId) {
          return;
        }

        const project = await db.projects.get(currentProjectId);
        if (!project) {
          return;
        }

        if (project.techStack) {
          setTechStack(project.techStack);
        } else {
          setTechStack(null);
        }
      } catch (error) {}
    };

    loadTechStack();
    setIsLoading(false);
  }, [isOpen]);

  useEffect(() => {
    const loadChatHistory = async () => {
      if (!isOpen) return;

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
        if (project?.aiChatHistory && project.aiChatHistory.length > 0) {
          setMessages(project.aiChatHistory);
        } else if (projectChanged) {
          setMessages([]);
        }
      } catch (error) {}
    };
    loadChatHistory();
  }, [projectId, isOpen]);

  useEffect(() => {
    const saveChatHistory = async () => {
      if (projectId && messages.length > 0) {
        try {
          await db.projects.update(projectId, {
            aiChatHistory: messages,
            updatedAt: new Date(),
          });
        } catch (error) {}
      }
    };
    saveChatHistory();
  }, [messages, projectId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const extractDBML = (content: string): string | null => {
    const dbmlMatch = content.match(/```dbml\n([\s\S]*?)\n```/);
    return dbmlMatch && dbmlMatch[1] ? dbmlMatch[1].trim() : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const settings = await getAISettings();
    if (!settings || (!settings.claudeApiKey && !settings.openaiApiKey)) {
      toast.error("Please configure your API keys first");
      onOpenSettings();
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
      let contextMessage = input;
      if (techStack && messages.length === 0) {
        contextMessage = `${input}

TECH STACK CONTEXT (use as guidelines, not rigid rules):

Authentication: ${techStack.authLibrary}
Payment/Billing: ${techStack.billingLibrary}
Database: ${techStack.database}
ORM: ${techStack.orm}
Language: ${techStack.language}
Framework: ${techStack.backendFramework}

REMEMBER: My request above is the PRIMARY requirement. The tech stack is just CONTEXT to help you make smart decisions. If I ask for features that need additional tables (like "OAuth", "subscriptions", "2FA"), ADD them regardless of the basic tech stack setup.`;
      }

      const aiMessages = [
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        {
          role: "user" as const,
          content: contextMessage,
        },
      ];

      let model;
      if (settings.provider === "claude" && settings.claudeApiKey) {
        const anthropic = createAnthropic({
          apiKey: settings.claudeApiKey,
        });
        model = anthropic("claude-sonnet-4-20250514");
      } else if (settings.openaiApiKey) {
        const openai = createOpenAI({
          apiKey: settings.openaiApiKey,
        });
        model = openai("gpt-4-turbo");
      } else {
        throw new Error("No valid API key configured");
      }

      const result = await streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: aiMessages,
        temperature: 0.1,
      });

      let fullResponse = "";
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      for await (const textPart of result.textStream) {
        fullResponse += textPart;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, content: fullResponse } : m,
          ),
        );
      }

      const dbml = extractDBML(fullResponse);
      if (dbml) {
        onSchemaGenerated(dbml);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate response",
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (
      confirm(
        "Are you sure you want to clear the chat history? This cannot be undone.",
      )
    ) {
      setMessages([]);
      if (projectId) {
        try {
          await db.projects.update(projectId, {
            aiChatHistory: [],
            updatedAt: new Date(),
          });
          toast.success("Chat history cleared");
        } catch (error) {
          toast.error("Failed to clear chat history");
        }
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">AI Schema Assistant</h2>
            <p className="text-xs text-muted-foreground">
              Production-ready schemas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="rounded-md p-2 transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Clear Chat History"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onOpenTechStack}
            className="rounded-md p-2 transition-colors hover:bg-muted"
            title="Change Tech Stack"
          >
            <Wrench className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenSettings}
            className="rounded-md p-2 transition-colors hover:bg-muted"
            title="AI Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-2 transition-colors hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tech Stack Banner */}
      {techStack && (
        <div className="border-b border-border bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground">
              Tech Stack:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center rounded-md bg-background border border-border px-2 py-0.5 font-medium">
                {techStack.database}
              </span>
              <span className="inline-flex items-center rounded-md bg-background border border-border px-2 py-0.5 font-medium">
                {techStack.orm}
              </span>
              <span className="inline-flex items-center rounded-md bg-background border border-border px-2 py-0.5 font-medium">
                {techStack.language}
              </span>
              <span className="inline-flex items-center rounded-md bg-background border border-border px-2 py-0.5 font-medium">
                {techStack.backendFramework}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {!techStack ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-lg border border-orange-500/50 bg-orange-500/10 p-8 max-w-md">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/20">
                <Wrench className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="mb-2 text-base font-semibold text-orange-900 dark:text-orange-100">
                Tech Stack Required
              </h3>
              <p className="mb-4 text-sm text-orange-800 dark:text-orange-200">
                Before using the AI assistant, please configure your
                project&apos;s tech stack. This ensures the generated schema
                matches your authentication library, database, and other
                requirements.
              </p>
              <Button
                onClick={onOpenTechStack}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Wrench className="h-4 w-4 mr-2" />
                Configure Tech Stack
              </Button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-lg border border-border bg-card p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-base font-semibold">
                AI Schema Assistant
              </h3>
              <p className="mb-4 text-sm text-muted-foreground max-w-sm">
                Describe your application and I will generate a production-ready
                database schema with proper relationships, indexes, and
                constraints.
              </p>
              <div className="space-y-1.5 text-left text-xs text-muted-foreground">
                <p className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>{" "}
                  Foreign key relationships
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>{" "}
                  Optimized indexes
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>{" "}
                  Data constraints
                </p>
                <p className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>{" "}
                  Scalability patterns
                </p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`w-full rounded-lg px-4 py-3 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card"
                }`}
              >
                <p className="whitespace-pre-wrap wrap-break-word">
                  {message.content}
                </p>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm w-full">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-muted-foreground">
                Generating schema...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-card p-4"
      >
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              !techStack
                ? "Please configure your tech stack first..."
                : "E.g., Create a SaaS app with user authentication, subscription billing, and team management..."
            }
            rows={3}
            className="resize-none text-sm"
            disabled={isLoading || !techStack}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && techStack) {
                  handleSubmit(e as any);
                }
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim() || !techStack}
            className="h-auto shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          {!techStack ? (
            <p>Configure tech stack to start using AI assistant</p>
          ) : (
            <>
              <p>Press Enter to send, Shift+Enter for new line</p>
              {messages.length > 0 && <p>{messages.length} messages</p>}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
