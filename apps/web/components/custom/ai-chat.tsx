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

const SYSTEM_PROMPT = `You are an expert database architect. Design PRODUCTION-READY schemas with PROPER RELATIONSHIPS.

🚨 CRITICAL RULE: EVERY TABLE MUST HAVE RELATIONSHIPS (except truly independent lookup tables)
- NO ORPHANED TABLES - every table must connect to other tables via foreign keys
- If you create a table, it MUST reference at least one other table OR be referenced by another table
- Example: stripe_webhooks MUST have user_id or order_id to connect to your domain

MANDATORY REQUIREMENTS:

1. RELATIONSHIPS (MOST IMPORTANT):
   ✅ CORRECT: Every table connected via foreign keys
   ❌ WRONG: Tables with no relationships (orphaned tables)

   Examples of REQUIRED relationships:
   - stripe_webhooks → MUST have: user_id, order_id, or payment_id foreign key
   - stripe_payment_intents → MUST link to: orders.id or payments.id
   - stripe_customers → MUST link to: users.id
   - notifications → MUST have: user_id (who receives it)
   - activity_logs → MUST have: user_id (who performed action)
   - media/files → MUST have: user_id or related entity_id
   - audit tables → MUST have: user_id or entity_id they track

2. MANDATORY FIELDS FOR ALL TABLES:
   - id: uuid [primary key, default: "gen_random_uuid()"]
   - created_at: timestamp [default: \`now()\`]
   - updated_at: timestamp [default: \`now()\`]
   - deleted_at: timestamp [null] (soft delete)

3. FOREIGN KEY RULES:
   - ALWAYS add [not null] to foreign keys unless truly optional
   - ALWAYS add foreign key to Indexes section
   - Use ref syntax: column_name uuid [not null, ref: > parent_table.id]
   - Name foreign keys descriptively: user_id, order_id, parent_id, etc.

4. PAYMENT PROVIDER INTEGRATION:
   If Stripe:
   - stripe_customers: user_id uuid [not null, ref: > users.id]
   - stripe_payment_intents: order_id uuid [not null, ref: > orders.id]
   - stripe_webhooks: MUST include user_id OR order_id
   - stripe_subscriptions: user_id uuid [not null, ref: > users.id]

   If Custom Provider (Paddle, Razorpay, etc):
   - payment_customers: user_id uuid [not null, ref: > users.id], provider_customer_id
   - payment_transactions: order_id uuid [not null, ref: > orders.id], transaction_id, provider
   - payment_webhooks: MUST include user_id OR order_id, event_type, provider
   - payment_subscriptions: user_id uuid [not null, ref: > users.id], provider_subscription_id

   If No Provider:
   - Just orders and order_items tables

5. AUTH INTEGRATION:
   If NextAuth.js:
   - users, accounts (user_id ref), sessions (user_id ref), verification_tokens

   If Clerk:
   - users (minimal - Clerk manages auth externally)

   If Custom Auth:
   - users, sessions (user_id ref), password_resets (user_id ref), email_verifications (user_id ref)

6. COMMON PATTERNS:
   - Notifications: user_id (recipient), actor_id (who triggered), entity_id (what it's about)
   - Activity Logs: user_id (actor), entity_type, entity_id
   - Media/Files: user_id (owner), entity_type, entity_id (what it belongs to)
   - Reviews: user_id (reviewer), target_type, target_id (what's being reviewed)

7. ENUMS FOR ALL STATUS FIELDS:
   - order_status, payment_status, user_status, listing_status, etc.
   - subscription_status: trialing, active, past_due, cancelled, incomplete

8. INDEXING (CRITICAL FOR PERFORMANCE):
   - Index ALL foreign keys (MANDATORY)
   - Index all status/enum fields
   - Index created_at for sorting queries
   - Index updated_at for recent changes queries
   - Index deleted_at for soft delete queries
   - Index email/username (unique)
   - Composite indexes for common query patterns:
     * (user_id, created_at) for user activity feeds
     * (status, created_at) for filtered time-based queries
     * (deleted_at, status) for active records queries
   - Full-text search indexes for search fields (title, description, name)

9. SCALABILITY PATTERNS:
   - Use BIGINT or BIGSERIAL for high-volume tables (likes, views, logs)
   - Partition large tables by date (logs, analytics, events)
   - Add sharding key hints for distributed databases
   - Use JSONB for flexible/evolving data structures
   - Consider read replicas: add indexes optimized for reads

10. DATA INTEGRITY & CONSTRAINTS:
   - Add CHECK constraints for business rules:
     * price/amount > 0
     * rating between 1-5
     * quantity > 0
     * email format validation
   - Unique constraints on natural keys (email, username, slug)
   - ON DELETE CASCADE for dependent records
   - ON DELETE SET NULL for optional relationships
   - Prevent circular references

11. SECURITY & PRIVACY:
   - Separate sensitive data (PII) into dedicated tables
   - Add encryption hints for sensitive fields (SSN, credit cards)
   - Audit columns: created_by, updated_by, deleted_by (user_id refs)
   - Rate limiting tables: track API usage per user
   - Session management: add ip_address, user_agent for security

12. PERFORMANCE OPTIMIZATIONS:
   - Denormalize calculated fields (total_orders, average_rating)
   - Counter caches (followers_count, likes_count)
   - Materialized view hints for complex aggregations
   - Separate hot/cold data (active vs archived)
   - Add version field for optimistic locking

13. OBSERVABILITY & DEBUGGING:
   - Include version/schema_version field in critical tables
   - Add metadata jsonb field for extensibility
   - Error/failure tracking tables with stack traces
   - Request/response logging for integrations
   - Add note fields for admin comments

EXAMPLE PRODUCTION ECOMMERCE:

\`\`\`dbml
Enum user_role {
  buyer
  seller
  admin
}

Enum listing_status {
  draft
  active
  sold
  inactive
}

Enum order_status {
  pending
  processing
  completed
  cancelled
  refunded
}

Table users {
  id uuid [primary key, default: "gen_random_uuid()"]
  email varchar(255) [unique, not null, note: "CHECK: valid email format"]
  password_hash varchar(255)
  name varchar(100)
  username varchar(50) [unique, not null]
  role user_role [default: "buyer"]
  stripe_customer_id varchar(255) [unique]
  avatar_url varchar(255)
  bio text
  email_verified_at timestamp
  phone varchar(20)
  is_active boolean [default: true]
  last_login_at timestamp
  login_count integer [default: 0]
  metadata jsonb [note: "Flexible field for additional user data"]
  created_at timestamp [default: \`now()\`]
  updated_at timestamp [default: \`now()\`]
  deleted_at timestamp

  Indexes {
    email [unique]
    username [unique]
    stripe_customer_id
    deleted_at
    (is_active, deleted_at) [note: "Composite for active users queries"]
    created_at [note: "For sorting by join date"]
  }
}

Table seller_profiles {
  id uuid [primary key]
  user_id uuid [unique, not null, ref: > users.id]
  shop_name varchar(255) [not null]
  shop_slug varchar(255) [unique, not null]
  shop_description text
  rating decimal(3,2) [note: "CHECK: rating >= 0 AND rating <= 5"]
  total_sales integer [default: 0, note: "Denormalized counter cache"]
  total_revenue decimal(12,2) [default: 0]
  is_verified boolean [default: false]
  verification_date timestamp
  created_at timestamp [default: \`now()\`]
  updated_at timestamp

  Indexes {
    user_id [unique]
    shop_slug [unique]
    (is_verified, rating) [note: "For verified seller listings"]
  }
}

Table listings {
  id uuid [primary key]
  seller_id uuid [not null, ref: > users.id]
  title varchar(255) [not null]
  slug varchar(255) [unique, not null]
  description text
  price decimal(10,2) [not null, note: "CHECK: price > 0"]
  compare_at_price decimal(10,2) [note: "Original price for discounts"]
  status listing_status [default: "draft"]
  view_count bigint [default: 0, note: "BIGINT for high traffic"]
  like_count integer [default: 0]
  inventory_quantity integer [default: 0, note: "CHECK: inventory_quantity >= 0"]
  sku varchar(100) [unique]
  metadata jsonb [note: "Product specs, variants, etc"]
  search_vector tsvector [note: "Full-text search index"]
  published_at timestamp
  created_at timestamp [default: \`now()\`]
  updated_at timestamp [default: \`now()\`]
  deleted_at timestamp

  Indexes {
    seller_id
    slug [unique]
    sku
    (status, deleted_at) [note: "Active listings"]
    (seller_id, status, created_at) [note: "Seller's listings feed"]
    created_at
    deleted_at
    search_vector [type: "GIN", note: "Full-text search"]
  }
}

Table listing_images {
  id uuid [primary key]
  listing_id uuid [not null, ref: > listings.id]
  image_url varchar(255) [not null]
  is_primary boolean [default: false]
  display_order integer [default: 0]
  created_at timestamp [default: \`now()\`]
  
  Indexes {
    listing_id
  }
}

Table orders {
  id uuid [primary key]
  order_number varchar(50) [unique, not null, note: "Human-readable order ID"]
  buyer_id uuid [not null, ref: > users.id]
  seller_id uuid [not null, ref: > users.id]
  subtotal_amount decimal(10,2) [not null, note: "CHECK: subtotal_amount > 0"]
  tax_amount decimal(10,2) [default: 0]
  shipping_amount decimal(10,2) [default: 0]
  discount_amount decimal(10,2) [default: 0]
  total_amount decimal(10,2) [not null, note: "CHECK: total_amount > 0"]
  status order_status [default: "pending"]
  stripe_payment_intent_id varchar(255)
  payment_method varchar(50)
  shipping_address jsonb
  billing_address jsonb
  notes text
  fulfilled_at timestamp
  cancelled_at timestamp
  refunded_at timestamp
  metadata jsonb
  version integer [default: 1, note: "Optimistic locking"]
  created_at timestamp [default: \`now()\`]
  updated_at timestamp [default: \`now()\`]

  Indexes {
    order_number [unique]
    buyer_id
    seller_id
    status
    (buyer_id, created_at) [note: "User order history"]
    (seller_id, status, created_at) [note: "Seller order management"]
    created_at
    stripe_payment_intent_id
  }
}

Table order_items {
  id uuid [primary key]
  order_id uuid [not null, ref: > orders.id]
  listing_id uuid [not null, ref: > listings.id]
  product_snapshot jsonb [note: "Snapshot of product at purchase time"]
  price_at_purchase decimal(10,2) [not null, note: "CHECK: price_at_purchase > 0"]
  quantity integer [default: 1, note: "CHECK: quantity > 0"]
  subtotal decimal(10,2) [not null]
  created_at timestamp [default: \`now()\`]

  Indexes {
    order_id
    listing_id
    (order_id, listing_id) [note: "Composite for order line items"]
  }
}

Table reviews {
  id uuid [primary key]
  order_id uuid [unique, not null, ref: > orders.id]
  listing_id uuid [not null, ref: > listings.id]
  reviewer_id uuid [not null, ref: > users.id]
  seller_id uuid [not null, ref: > users.id]
  rating integer [not null, note: "CHECK: rating >= 1 AND rating <= 5"]
  title varchar(255)
  comment text
  helpful_count integer [default: 0]
  is_verified_purchase boolean [default: true]
  is_flagged boolean [default: false]
  flagged_reason text
  created_at timestamp [default: \`now()\`]
  updated_at timestamp [default: \`now()\`]

  Indexes {
    order_id [unique]
    listing_id
    reviewer_id
    seller_id
    (seller_id, created_at) [note: "Seller reviews feed"]
    (listing_id, rating, created_at) [note: "Product reviews sorted by rating"]
    created_at
  }
}

// STRIPE TABLES - Notice ALL have relationships to domain tables
Table stripe_customers {
  id uuid [primary key]
  user_id uuid [unique, not null, ref: > users.id]
  stripe_customer_id varchar(255) [unique, not null]
  created_at timestamp [default: \`now()\`]

  Indexes {
    user_id
    stripe_customer_id
  }
}

Table stripe_payment_intents {
  id uuid [primary key]
  order_id uuid [not null, ref: > orders.id]
  stripe_payment_intent_id varchar(255) [unique, not null]
  amount integer [not null]
  currency varchar(3) [default: "usd"]
  status varchar(50) [not null]
  created_at timestamp [default: \`now()\`]
  updated_at timestamp

  Indexes {
    order_id
    stripe_payment_intent_id
    status
  }
}

Table stripe_webhooks {
  id uuid [primary key]
  event_id varchar(255) [unique, not null]
  event_type varchar(255) [not null]
  user_id uuid [ref: > users.id]
  order_id uuid [ref: > orders.id]
  data jsonb [not null]
  processed boolean [default: false]
  created_at timestamp [default: \`now()\`]

  Indexes {
    event_id
    user_id
    order_id
    processed
    created_at
  }
}
\`\`\`

// CUSTOM PAYMENT PROVIDER EXAMPLE (Paddle, Razorpay, Dodo, etc)
Table payment_customers {
  id uuid [primary key]
  user_id uuid [unique, not null, ref: > users.id]
  provider varchar(50) [not null, note: "stripe, paddle, razorpay, etc"]
  provider_customer_id varchar(255) [unique, not null]
  created_at timestamp [default: \`now()\`]

  Indexes {
    user_id
    provider_customer_id
  }
}

Table payment_transactions {
  id uuid [primary key]
  order_id uuid [not null, ref: > orders.id]
  provider varchar(50) [not null]
  transaction_id varchar(255) [unique, not null]
  amount integer [not null]
  currency varchar(3) [default: "usd"]
  status varchar(50) [not null]
  created_at timestamp [default: \`now()\`]
  updated_at timestamp

  Indexes {
    order_id
    transaction_id
    status
  }
}

Table payment_webhooks {
  id uuid [primary key]
  event_id varchar(255) [unique, not null]
  event_type varchar(255) [not null]
  provider varchar(50) [not null]
  user_id uuid [ref: > users.id]
  order_id uuid [ref: > orders.id]
  data jsonb [not null]
  processed boolean [default: false]
  created_at timestamp [default: \`now()\`]

  Indexes {
    event_id
    user_id
    order_id
    processed
    provider
  }
}
\`\`\`

VALIDATION CHECKLIST (check before responding):
✓ Every table has at least one foreign key OR is referenced by another table
✓ All foreign keys are indexed (MANDATORY)
✓ All tables have created_at, updated_at, deleted_at
✓ All status fields use enums
✓ CHECK constraints on amounts (> 0), ratings (1-5), quantities (> 0)
✓ Unique constraints on natural keys (email, username, slug, SKU)
✓ Composite indexes for common query patterns
✓ Counter caches denormalized where needed (followers_count, etc)
✓ JSONB fields for flexible/evolving data
✓ BIGINT for high-volume tables (views, likes, logs)
✓ Full-text search indexes where needed (title, description)
✓ Product snapshots in order items (preserve historical data)
✓ Human-readable IDs (order_number) alongside UUIDs
✓ Metadata fields for extensibility
✓ Version fields for optimistic locking on critical tables
✓ Payment provider tables link to users/orders
✓ Auth tables link to users
✓ Notification/activity tables link to users

IMPORTANT: For custom payment providers, use generic "payment_" prefix instead of provider-specific names.
Example: payment_webhooks (not paddle_webhooks, razorpay_webhooks, etc)

GENERATE SCHEMAS THAT LOOK LIKE THIS - complete, organized, production-ready with PROPER RELATIONSHIPS!`;

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

  useEffect(() => {
    if (initialTechStack) {
      setTechStack(initialTechStack);
    }
  }, [initialTechStack]);

  useEffect(() => {
    const loadChatHistory = async () => {
      if (projectId && isOpen) {
        try {
          const project = await db.projects.get(projectId);
          if (project?.aiChatHistory) {
            setMessages(project.aiChatHistory);
          }
        } catch (error) {
          console.error("Failed to load chat history:", error);
        }
      }
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
        contextMessage = `I'm building: ${input}

TECH STACK YOU MUST CONSIDER:
- Database: ${techStack.database}
- Auth Library: ${techStack.authLibrary} ${
          techStack.authLibrary !== "None"
            ? "(You MUST include appropriate auth tables for this library)"
            : "(Create custom auth tables)"
        }
- Billing Library: ${techStack.billingLibrary} ${
          techStack.billingLibrary !== "None"
            ? "(You MUST include appropriate payment/billing tables for this library)"
            : "(Keep payment tables simple)"
        }
- ORM: ${techStack.orm}
- Language: ${techStack.language}
- Framework: ${techStack.backendFramework}

Generate a schema that matches MY SPECIFIC USE CASE above, not a generic SaaS template. Include auth and billing tables based on the libraries I selected.`;
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
        {messages.length === 0 ? (
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
            placeholder="E.g., Create a SaaS app with user authentication, subscription billing, and team management..."
            rows={3}
            className="resize-none text-sm"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) {
                  handleSubmit(e as any);
                }
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
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
          <p>Press Enter to send, Shift+Enter for new line</p>
          {messages.length > 0 && <p>{messages.length} messages</p>}
        </div>
      </form>
    </div>
  );
}
