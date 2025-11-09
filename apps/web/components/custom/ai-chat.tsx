"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, X, Settings, Sparkles, Wrench, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAISettings } from "./api-settings-dialog";
import type { TechStack } from "./ai-tech-stack-dialog";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { toast } from "sonner";
import { db } from "@/lib/db";

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
  onSchemaGenerated: (dbml: string) => void;
  onOpenSettings: () => void;
  onOpenTechStack: () => void;
  initialTechStack?: TechStack;
  projectId?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are an expert database architect. Design schemas based on EXACTLY what the user asks for.

CRITICAL RULES:
1. LISTEN TO THE USER - Build what they ask for, not what you think they need
2. KEEP IT SIMPLE - If they ask for a simple todo app, give them a simple todo app
3. DON'T ADD UNNECESSARY FEATURES - No Stripe, no complex auth, no analytics unless specifically requested
4. MATCH THE SCOPE - Simple request = simple schema, Complex request = complex schema
5. RESPECT THE SELECTED TECH STACK - The user has chosen specific libraries for auth and billing, use ONLY those

MANDATORY REQUIREMENTS:

1. RELATIONSHIPS:
   - Tables should have foreign keys to connect related data
   - Only add relationships that make sense for the user's use case
   - For simple apps, keep relationships simple

2. STANDARD FIELDS FOR TABLES:
   - id: uuid [primary key, default: "gen_random_uuid()"]
   - created_at: timestamp [default: \`now()\`]
   - updated_at: timestamp [default: \`now()\`]
   - deleted_at: timestamp [null] (optional soft delete)

3. FOREIGN KEY SYNTAX:
   - Use ref syntax: column_name uuid [not null, ref: > parent_table.id]
   - Add foreign keys to Indexes section
   - Name descriptively: user_id, order_id, parent_id

4. CHECK CONSTRAINTS (IMPORTANT - CORRECT SYNTAX):
   ❌ WRONG: price decimal(10,2) [not null, check: "price > 0"]
   ✅ CORRECT: price decimal(10,2) [not null, note: "CHECK: price > 0"]

   DBML uses "note:" for CHECK constraints, NOT "check:"
   Examples:
   - amount decimal(10,2) [not null, note: "CHECK: amount > 0"]
   - rating integer [not null, note: "CHECK: rating >= 1 AND rating <= 5"]
   - quantity integer [default: 1, note: "CHECK: quantity > 0"]

5. ENUMS FOR STATUS FIELDS:
   - Use enums for status, role, type fields when appropriate

6. INDEXING:
   - Index foreign keys
   - Index frequently queried fields (email, username, status)
   - For complex apps, add composite indexes for common queries

7. SIMPLE TODO APP EXAMPLE:

\`\`\`dbml
Enum todo_status {
  pending
  completed
}

Table users {
  id uuid [primary key, default: "gen_random_uuid()"]
  email varchar(255) [unique, not null]
  name varchar(100)
  created_at timestamp [default: \`now()\`]

  Indexes {
    email [unique]
  }
}

Table todos {
  id uuid [primary key, default: "gen_random_uuid()"]
  user_id uuid [not null, ref: > users.id]
  title varchar(255) [not null]
  description text
  status todo_status [default: "pending"]
  due_date timestamp
  created_at timestamp [default: \`now()\`]
  updated_at timestamp [default: \`now()\`]

  Indexes {
    user_id
    status
    (user_id, status)
  }
}
\`\`\`

8. AUTH INTEGRATION - STRICTLY FOLLOW THE SELECTED LIBRARY:

   IF AUTH LIBRARY IS "Clerk":
   - Create MINIMAL users table with ONLY: id, clerk_user_id, email, name, created_at, updated_at
   - clerk_user_id should be varchar(255) [unique, not null]
   - DO NOT create accounts, sessions, verification_tokens, or password tables if user said "simple app" 
   - Clerk handles ALL authentication externally
   - Add all need thing when user said we need good auth or oauth

   IF AUTH LIBRARY IS "NextAuth" or "next-auth":
   - Create full NextAuth schema: users, accounts, sessions, verification_tokens tables
   - Follow NextAuth database adapter schema exactly

   IF AUTH LIBRARY IS "Custom Auth" or "custom":
   - Create custom auth tables: users (with password_hash), sessions, password_resets
   - Include proper security fields like email_verified, two_factor_enabled, etc.

   IF AUTH LIBRARY IS "None":
   - Create basic users table without auth-specific fields
   - Just id, email, name, timestamps

9. PAYMENT/BILLING INTEGRATION - STRICTLY FOLLOW THE SELECTED LIBRARY:

   IF BILLING LIBRARY IS "Stripe":
   - Add stripe_customers table with: id, user_id, stripe_customer_id, stripe_subscription_id
   - Add subscriptions table with: id, user_id, stripe_subscription_id, status, current_period_end
   - Add payment_intents table if needed for the use case

   IF BILLING LIBRARY IS "Custom Provider" or "custom":
   - Add generic payment tables: customers, subscriptions, invoices, payments
   - Use generic column names without provider prefixes

   IF BILLING LIBRARY IS "None":
   - DO NOT add any payment or billing tables unless explicitly requested
   - Focus only on the core application features

IMPORTANT REMINDERS:
- ALWAYS use "note:" for CHECK constraints, NEVER "check:"
- Match the complexity to the user's request
- NEVER ignore the selected auth library - if user selected Clerk, use Clerk schema
- NEVER add NextAuth tables when user selected Clerk
- NEVER add payment tables when billing is set to "None"
- If user says "simple todo app" - give them ONLY users and todos tables
- The user's tech stack selection is MANDATORY, not a suggestion
- Always respect the user's tech stack selection at same time be flexible and listen to the user's needs


RESPONSE FORMAT:
- Always wrap DBML code in \`\`\`dbml code blocks
- Be concise - focus on what the user actually needs
- Explain briefly what you included and why`;

export function AIChat({
  isOpen,
  onClose,
  onSchemaGenerated,
  onOpenSettings,
  onOpenTechStack,
  initialTechStack,
  projectId,
}: AIChatProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [techStack, setTechStack] = useState<TechStack | null>(
    initialTechStack || null
  );
  const prevProjectIdRef = useRef<number | undefined>(null);

  useEffect(() => {
    if (initialTechStack) {
      setTechStack(initialTechStack);
    }
  }, [initialTechStack]);

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
        // Don't clear tech stack if initialTechStack is provided
        if (!initialTechStack) {
          setTechStack(null);
        }
      }

      try {
        const project = await db.projects.get(projectId);
        if (project?.aiChatHistory && project.aiChatHistory.length > 0) {
          setMessages(project.aiChatHistory);
        } else if (projectChanged) {
          setMessages([]);
        }

        // Only load tech stack from DB if initialTechStack is not provided
        if (!initialTechStack) {
          if (project?.techStack) {
            setTechStack({ ...project.techStack, description: "" });
          } else {
            setTechStack(null);
          }
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    };
    loadChatHistory();
  }, [projectId, isOpen, initialTechStack]);

  useEffect(() => {
    const saveChatHistory = async () => {
      if (projectId && messages.length > 0) {
        try {
          await db.projects.update(projectId, {
            aiChatHistory: messages,
            updatedAt: new Date(),
          });
        } catch (error) {
          console.error("Failed to save chat history:", error);
        }
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
        const authInstructions =
          techStack.authLibrary === "clerk" || techStack.authLibrary === "Clerk"
            ? "⚠️ CLERK AUTHENTICATION - Create ONLY a minimal users table with: id, clerk_user_id (unique), email, name, created_at, updated_at. DO NOT create accounts, sessions, or password tables."
            : techStack.authLibrary === "next-auth" || techStack.authLibrary === "NextAuth.js"
            ? "NextAuth.js - Create full NextAuth schema with users, accounts, sessions, verification_tokens tables"
            : techStack.authLibrary === "custom" || techStack.authLibrary === "Custom Auth"
            ? "Custom Auth - Create users table with password_hash, sessions, and password_resets tables"
            : "No auth library selected - Create basic users table without auth-specific fields";

        const billingInstructions =
          techStack.billingLibrary === "stripe" || techStack.billingLibrary === "Stripe"
            ? "Stripe - Create stripe_customers and subscriptions tables"
            : techStack.billingLibrary === "none" || techStack.billingLibrary === "None"
            ? "⚠️ NO BILLING - DO NOT create any payment or billing tables unless I explicitly ask for them"
            : "Custom billing - Create generic payment tables if needed";

        contextMessage = `I'm building: ${input}

⚠️ CRITICAL - MY SELECTED TECH STACK (YOU MUST FOLLOW THIS EXACTLY):

1. Authentication: ${techStack.authLibrary}
   ${authInstructions}

2. Billing/Payments: ${techStack.billingLibrary}
   ${billingInstructions}

3. Database: ${techStack.database}
4. ORM: ${techStack.orm}
5. Language: ${techStack.language}
6. Framework: ${techStack.backendFramework}

IMPORTANT: Generate a schema that matches MY SPECIFIC USE CASE and MY SELECTED TECH STACK. Do not add tables for libraries I didn't select.`;
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
      console.error("AI chat error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to generate response"
      );
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (confirm("Are you sure you want to clear the chat history? This cannot be undone.")) {
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
                Before using the AI assistant, please configure your project's tech stack.
                This ensures the generated schema matches your authentication library, database, and other requirements.
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
                Describe your application and I'll generate a production-ready
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
