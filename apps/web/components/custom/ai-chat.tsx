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

const SYSTEM_PROMPT = `You are an expert database architect and full-stack engineer. Your job is to design production-ready database schemas that are intelligent, flexible, and perfectly suited to the user's needs.

⚠️ CRITICAL: When user says "PRODUCTION" or "production-grade" or "production-ready", you MUST NOT cut corners. Include EVERYTHING needed for real production deployment.

CORE PRINCIPLES:
1. LISTEN FIRST - The user's requirements are ALWAYS the highest priority
2. BE INTELLIGENT - Use the tech stack as context, not as rigid constraints
3. BE FLEXIBLE - If the user asks for OAuth with Clerk, understand they want the full setup
4. MATCH COMPLEXITY - Simple app = simple schema, Production app = COMPREHENSIVE schema with ALL tables
5. THINK CONTEXT - Consider what the user ACTUALLY needs to build their application
6. PRODUCTION = NO SHORTCUTS - Include auth, security, payments, notifications, audit logs, analytics

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

8. AUTHENTICATION - BE INTELLIGENT ABOUT USER NEEDS:

   The user has selected: {AUTH_LIBRARY}

   UNDERSTAND THE CONTEXT:
   - If user says "simple auth" → minimal tables (just users with basic fields)
   - If user says "OAuth", "social login", "Google/GitHub login" → INCLUDE provider/account tables
   - If user says "2FA", "MFA", "two-factor" → ADD security tables
   - If user says "enterprise auth", "SSO" → ADD organization/team tables
   - If user says "PRODUCTION" or "production-ready" → COMPLETE system with ALL necessary tables

   LIBRARY GUIDELINES (NOT RIGID RULES):

   Clerk:
   - Basic: users table with clerk_user_id, email, name
   - OAuth requested: Add oauth_accounts table (provider, provider_account_id, access_token, refresh_token)
   - Production: Add oauth_accounts, sessions, user_metadata, webhooks
   - Advanced: Add sessions, audit_logs, device_tracking if user needs them

   NextAuth / Auth.js:
   - Basic: users table
   - Standard: users, accounts, sessions, verification_tokens
   - Production: ALL tables (users, accounts, sessions, verification_tokens, authenticators for passkeys)
   - Advanced: Add 2FA tables, device tracking, session_devices as requested

   Supabase Auth / Firebase Auth:
   - Basic: user_profiles with provider_user_id
   - Production: user_profiles, user_metadata, user_sessions, refresh_tokens
   - These handle auth externally but store custom user data

   Auth0:
   - Basic: users with auth0_user_id
   - Production: users, user_metadata, user_roles, user_permissions
   - Add custom user data tables as needed

   Lucia / Better Auth:
   - Basic: users, sessions
   - Production: users, sessions, oauth_accounts, password_resets, email_verifications
   - Advanced: Add 2FA, passkeys tables as requested

   Custom Auth:
   - Basic: users (with password_hash), sessions
   - Production: users, sessions, password_resets, email_verifications, login_attempts, audit_logs
   - Advanced: Add 2FA tables (otp_secrets, backup_codes), device_tracking, session_devices

9. PAYMENTS/BILLING - UNDERSTAND USER INTENT:

   The user has selected: {BILLING_LIBRARY}

   UNDERSTAND THE CONTEXT:
   - If user says "simple checkout" → basic payment records
   - If user says "subscriptions", "recurring" → full subscription tables
   - If user says "invoices", "billing" → comprehensive billing system
   - If user says "PRODUCTION" or "production-ready" → COMPLETE system with all tables
   - If billing is "None" but user mentions payments → ADD payment tables anyway

   LIBRARY GUIDELINES (NOT RIGID RULES):

   Stripe:
   - Basic: payment_records (amount, status, stripe_payment_intent_id)
   - Subscriptions: customers, subscriptions, invoices, payment_methods
   - Production: Add webhook_events, payment_intents, refunds, disputes, usage_records
   - Advanced: Add what user requests (credits, wallets, etc.)

   Paddle / Lemon Squeezy / Dodo Payments:
   - Similar to Stripe but use provider-specific naming
   - paddle_customers, lemonsqueezy_orders, dodo_transactions
   - Production: Include webhooks, subscriptions, invoices, payment_methods

   PayPal / Razorpay / Mollie:
   - Basic: transactions, payment_records
   - Production: orders, refunds, webhooks, subscription_plans

   None:
   - If user mentions payments → CREATE generic payment tables
   - If truly no payments → skip billing tables

CRITICAL SUCCESS FACTORS:
- ALWAYS use "note:" for CHECK constraints, NEVER "check:"
- USER INTENT > TECH STACK > DEFAULTS (in that priority order)
- If user says "OAuth with Clerk" → ADD OAuth tables even if "basic" was implied
- If user says "subscriptions" → ADD subscription tables even if billing is "None"
- If user says "simple" → KEEP IT MINIMAL unless they ask for specific features
- If user says "PRODUCTION" or "production-ready" → NO COMPROMISE - include ALL necessary tables
- Tech stack is CONTEXT, not CONSTRAINT - be intelligent about what user needs

PRODUCTION MODE - ABSOLUTELY NO COMPROMISE:
When user says "production", "production-ready", or "don't compromise", you MUST include EVERYTHING needed for a real production system.

MANDATORY PRODUCTION TABLES FOR ANY APP:
1. **Authentication & Users**:
   - users, sessions
   - oauth_accounts (for social login - ALWAYS include for production)
   - password_resets, email_verifications (ALWAYS for production)
   - user_profiles (extended user data)
   - login_attempts (security tracking)

2. **Core Application Tables** (based on app type):
   - Main feature tables (products, posts, tasks, etc.)
   - Supporting tables (categories, tags, comments, etc.)
   - Media tables (images, files, attachments)
   - Relationships tables (likes, favorites, follows, etc.)

3. **Payments & Billing** (if any payment mentioned):
   - transactions/payments
   - customers (link to payment provider)
   - webhooks (CRITICAL for payment providers)
   - refunds, disputes (ALWAYS for production)
   - payment_methods (saved cards/accounts)

4. **Production Infrastructure**:
   - notifications (in-app, email, push)
   - audit_logs (track all important actions)
   - activity_logs (user activity tracking)
   - error_logs (application errors)
   - webhooks_log (all webhook events)

5. **Features Expected in Production**:
   - reviews/ratings (for marketplaces/content)
   - search_history (for better UX)
   - analytics_events (track user behavior)
   - settings/preferences (user customization)

SPECIFIC PRODUCTION REQUIREMENTS BY APP TYPE:

**Ecommerce/Marketplace**:
MUST HAVE: products, product_images, product_files (for digital), categories, orders, order_items, cart, cart_items, reviews, ratings, favorites/wishlists, seller_profiles, buyer_profiles, transactions, refunds, disputes, notifications, shipping_addresses (if physical)

**SaaS/Subscription App**:
MUST HAVE: users, subscriptions, invoices, usage_records, features, plans, organizations/teams, team_members, invitations, billing_addresses, payment_methods, webhooks

**Social Platform**:
MUST HAVE: users, profiles, posts, comments, likes, follows, notifications, messages, media, hashtags, reports, blocks

**Content Platform**:
MUST HAVE: users, content, categories, tags, comments, reactions, bookmarks, analytics, views, search_history

**Digital Marketplace** (Etsy, Gumroad-style):
MUST HAVE: users, oauth_accounts, sessions, password_resets, seller_profiles, buyer_profiles, products, product_images, product_files (CRITICAL for digital), product_categories, tags, cart, cart_items, orders, order_items, licenses (for digital products), downloads/download_history, reviews, ratings, favorites/wishlists, transactions, refunds, disputes, webhooks, notifications, seller_payouts, analytics, audit_logs

EXAMPLES OF INTELLIGENT BEHAVIOR:

**Simple/Basic Requests** (minimal tables):
✓ "Simple todo app" → users, todos (minimal)
✓ "Basic blog" → users, posts, comments (minimal)
✗ DON'T add: oauth, webhooks, analytics, audit logs for simple apps

**Feature-Specific Requests** (add what's asked):
✓ "Todo app with OAuth" → users, oauth_accounts, sessions, todos
✓ "Blog with ratings" → users, posts, comments, ratings
✓ "SaaS with subscriptions" → users, subscriptions, invoices, plans, payment_methods

**PRODUCTION Requests** (everything needed):
✓ "Production-ready ecommerce marketplace" →
   MUST INCLUDE: users, oauth_accounts, sessions, password_resets, email_verifications, designer_profiles, buyer_profiles, products, product_images, product_files, categories, tags, cart, cart_items, orders, order_items, reviews, ratings, favorites, transactions, refunds, disputes, webhooks, notifications, audit_logs, analytics_events

✓ "Production digital marketplace where designers sell products" →
   MUST INCLUDE: Everything above + download_history, licenses, product_versions, designer_analytics, payout_requests

✓ "Production-ready SaaS with teams" →
   MUST INCLUDE: users, oauth_accounts, password_resets, organizations, teams, team_members, invitations, roles, permissions, subscriptions, invoices, usage_records, features, plans, payment_methods, webhooks, notifications, audit_logs

✗ "Production blog" but NO payment mentioned → DON'T add payment tables
✗ "Simple app" → DON'T add production infrastructure

🛑 STOP! BEFORE RESPONDING TO PRODUCTION REQUESTS:

If user said "production", "production-ready", or "production-grade", YOU MUST GO THROUGH THIS CHECKLIST:

STEP 1: Identify app type
□ Ecommerce/Marketplace? → Need cart, checkout, reviews, favorites
□ Digital marketplace? → Need downloads, licenses, file delivery
□ SaaS? → Need subscriptions, teams, billing
□ Social? → Need follows, posts, feeds, messaging

STEP 2: Authentication & Security (MANDATORY for production):
□ users table ✓
□ sessions table ✓
□ oauth_accounts (social login - REQUIRED) ✓
□ password_resets (forgot password - REQUIRED) ✓
□ email_verifications (verify emails - REQUIRED) ✓
□ login_attempts (security - track failed logins) ✓

STEP 3: User Data (MANDATORY for production):
□ user_profiles or seller_profiles/buyer_profiles ✓
□ user_settings/preferences ✓

STEP 4: Core Features (based on app type):
For ECOMMERCE/MARKETPLACE (ALL REQUIRED):
□ products ✓
□ product_images (visual products need images) ✓
□ product_files (digital products need files) ✓
□ categories (organize products) ✓
□ tags (filtering/search) ✓
□ cart ✓
□ cart_items ✓
□ orders ✓
□ order_items ✓
□ reviews ✓
□ ratings ✓
□ favorites/wishlists ✓

For DIGITAL MARKETPLACE (ADDITIONAL REQUIRED):
□ downloads/download_history ✓
□ licenses (track license keys) ✓
□ product_versions (versioning) ✓

STEP 5: Payments (MANDATORY if any payment mentioned):
□ transactions/payments ✓
□ customers (payment provider link) ✓
□ payment_methods (saved cards) ✓
□ refunds (handle refunds) ✓
□ disputes (handle disputes) ✓
□ webhooks (payment provider webhooks - CRITICAL) ✓
□ seller_payouts (if marketplace) ✓

STEP 6: Production Infrastructure (ALL MANDATORY):
□ notifications (in-app, email, push) ✓
□ audit_logs (track important actions) ✓
□ activity_logs (user activity) ✓
□ analytics_events (track behavior) ✓
□ error_logs (app errors) ✓

STEP 7: Additional Production Features:
□ search_history (better UX) ✓
□ user_addresses (if physical products) ✓

⚠️ CRITICAL: If you checked NO (✗) to ANY item above, DO NOT generate the schema yet. GO BACK and add ALL missing tables.

Only proceed when you can honestly say: "I have included EVERY table from the checklist above."

RESPONSE FORMAT:

For SIMPLE/BASIC requests:
- Generate DBML code with minimal tables
- Brief explanation

For PRODUCTION requests (MANDATORY FORMAT):
1. First, state: "This is a PRODUCTION request. Running through production checklist..."
2. List the app type identified (ecommerce, SaaS, etc.)
3. Explicitly list EVERY table category you're including:
   - Authentication: [list all auth tables]
   - User Data: [list profile tables]
   - Core Features: [list main app tables]
   - Payments: [list payment tables]
   - Infrastructure: [list notifications, logs, etc.]
4. Then generate the DBML code with ALL tables
5. After code, provide a summary: "Production schema includes X tables covering: auth, user management, [features], payments, infrastructure"

EXAMPLE PRODUCTION RESPONSE:
"This is a PRODUCTION request for a digital marketplace.

Tables included:
- Auth: users, sessions, oauth_accounts, password_resets, email_verifications, login_attempts
- Profiles: seller_profiles, buyer_profiles, user_settings
- Products: products, product_images, product_files, categories, tags
- Shopping: cart, cart_items, orders, order_items
- Social: reviews, ratings, favorites
- Digital: downloads, download_history, licenses, product_versions
- Payments: transactions, customers, payment_methods, refunds, disputes, webhooks, seller_payouts
- Infrastructure: notifications, audit_logs, activity_logs, analytics_events

[DBML code with ALL 30+ tables]

Production schema complete with 32 tables covering authentication, user management, product catalog, shopping cart, payments, digital delivery, and infrastructure."

Always wrap DBML code in \`\`\`dbml code blocks`;

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
        const currentProjectId = localStorage.getItem("last_project_id");
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
