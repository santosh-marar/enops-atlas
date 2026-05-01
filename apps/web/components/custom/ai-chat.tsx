"use client";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
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
import { SYSTEM_PROMPT } from "@/ai/prompt/system-prompt";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import type { TechStack } from "./ai-tech-stack-dialog";
import { getAISettings } from "./api-settings-dialog";

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenTechStack: () => void;
  onSchemaGenerated: (dbml: string) => void;
  projectId?: string;
}

interface Message {
  content: string;
  id: string;
  role: "user" | "assistant";
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
    if (!isOpen) {
      return;
    }
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
      if (!isOpen) {
        return;
      }

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
    if (!input.trim() || isLoading) {
      return;
    }

    const settings = await getAISettings();
    if (!(settings && (settings.claudeApiKey || settings.openaiApiKey))) {
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
            m.id === assistantMessage.id ? { ...m, content: fullResponse } : m
          )
        );
      }

      const dbml = extractDBML(fullResponse);
      if (dbml) {
        onSchemaGenerated(dbml);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate response"
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (
      confirm(
        "Are you sure you want to clear the chat history? This cannot be undone."
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
              <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium">
                {techStack.database}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium">
                {techStack.orm}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium">
                {techStack.language}
              </span>
              <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 font-medium">
                {techStack.backendFramework}
              </span>
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
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-lg border border-border bg-card p-8">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold text-base">
                  AI Schema Assistant
                </h3>
                <p className="mb-4 max-w-sm text-muted-foreground text-sm">
                  Describe your application and I will generate a
                  production-ready database schema with proper relationships,
                  indexes, and constraints.
                </p>
                <div className="space-y-1.5 text-left text-muted-foreground text-xs">
                  <p className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">
                      ✓
                    </span>{" "}
                    Foreign key relationships
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">
                      ✓
                    </span>{" "}
                    Optimized indexes
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">
                      ✓
                    </span>{" "}
                    Data constraints
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="text-green-600 dark:text-green-400">
                      ✓
                    </span>{" "}
                    Scalability patterns
                  </p>
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
                key={message.id}
              >
                <div
                  className={`w-full rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card"
                  }`}
                >
                  <p className="wrap-break-word whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
              </div>
            ))
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="max-w-md rounded-lg border border-orange-500/50 bg-orange-500/10 p-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/20">
                <Wrench className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="mb-2 font-semibold text-base text-orange-900 dark:text-orange-100">
                Tech Stack Required
              </h3>
              <p className="mb-4 text-orange-800 text-sm dark:text-orange-200">
                Before using the AI assistant, please configure your
                project&apos;s tech stack. This ensures the generated schema
                matches your authentication library, database, and other
                requirements.
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

      {/* Input Form */}
      <form
        className="border-border border-t bg-card p-4"
        onSubmit={handleSubmit}
      >
        <div className="flex gap-2">
          <Textarea
            className="resize-none text-sm"
            disabled={isLoading || !techStack}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && techStack) {
                  handleSubmit(e as any);
                }
              }
            }}
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
