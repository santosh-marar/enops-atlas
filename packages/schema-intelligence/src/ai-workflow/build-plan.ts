import { z } from "zod";
import type { SchemaModel } from "../model";
import type {
  BuildPlanResult,
  IntentType,
  TablePlanEntry,
  TaskPlan,
} from "./types";

const CONFIDENCE_THRESHOLD = 0.65;

// inspect/validate produce no schema mutation — nothing to approve, so they
// skip the plan/approve/execute chain entirely and answer directly.
const READ_ONLY_INTENTS: IntentType[] = ["inspect", "validate"];

// ── Read-only path: inspect / validate ──

const AnswerSchema = z.object({
  answer: z.string().optional(),
  clarifyingQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  suggestedOptions: z.array(z.string()).optional(),
});

function buildAnswerPrompt(params: {
  intentType: IntentType;
  entityName: string | null;
  transcript: string;
  retrievedContext: string;
}): string {
  const { intentType, entityName, transcript, retrievedContext } = params;
  const grounding = retrievedContext
    ? `Relevant schema context:\n${retrievedContext}`
    : "No specific entity was named — this applies to the schema as a whole.";
  const entityNote = entityName ? `Target: "${entityName}".` : "";

  return `You are answering a developer's ${intentType} request about their database schema — this is read-only, nothing changes as a result.

${entityNote}
${grounding}

${transcript}

If this includes prior clarifying questions and answers above, use them together with the original request.

Rules:
- Only ask for clarification if it's genuinely unclear *what* to inspect/validate — the answer itself requiring judgment is not a reason to ask.
- Otherwise, answer directly and completely in "answer" — plain prose, no schema-change proposal.

Respond with ONLY a JSON object, no other text:
{"confidence": 0.0-1.0, "needsClarification": true|false, "clarifyingQuestion": "..." (if needsClarification), "suggestedOptions": ["..."] (optional), "answer": "..." (if not needsClarification)}`;
}

async function buildAnswer(params: {
  model: SchemaModel;
  intentType: IntentType;
  entityName: string | null;
  transcript: string;
  retrievedContext: string;
}): Promise<BuildPlanResult> {
  const { object: raw } = await params.model.generateObject({
    maxOutputTokens: 1000,
    prompt: params.transcript,
    schema: AnswerSchema,
    system: buildAnswerPrompt(params),
    tier: "fast",
  });

  if (
    raw.needsClarification ||
    raw.confidence < CONFIDENCE_THRESHOLD ||
    !raw.answer
  ) {
    return {
      clarifyingQuestion:
        raw.clarifyingQuestion ??
        "Could you clarify what you'd like me to look at?",
      status: "needs_clarification",
      suggestedOptions: raw.suggestedOptions,
    };
  }

  return { content: raw.answer, status: "answered" };
}

// ── Change path: generate / modify / add / remove / rename ──
// Decides WHICH tables are involved and whether each is new — never designs
// columns/types/relationships here, same discipline as the proven legacy
// generatePlan(): that level of detail happens directly in DBML at
// Executor, from the assembled prompt this stage produces.

const PlanSchema = z.object({
  clarifyingQuestion: z.string().optional(),
  confidence: z.number().min(0).max(1),
  // Lenient on purpose: the model may list more, or send an empty list while
  // asking a question. Both are handled after parsing, not as a hard error.
  decisions: z.array(z.string()).optional(),
  needsClarification: z.boolean(),
  suggestedOptions: z.array(z.string()).optional(),
  tables: z
    .array(z.object({ isNew: z.boolean(), name: z.string() }))
    .optional(),
});

/** Absorbed from the retired plan/generate-plan.ts — COMMITTED TECH STACK section. */
function techStackSection(
  techStack?: Record<string, string | null> | null
): string | null {
  if (!techStack) return null;
  const lines = Object.entries(techStack)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`);
  if (lines.length === 0) return null;
  return `COMMITTED TECH STACK (fixed, do not ask about it):\n${lines.join("\n")}`;
}

/** Absorbed from the retired plan/generate-plan.ts — PREVIOUS APPROVED PLAN section. */
function previousPlanSection(plan?: TaskPlan | null): string | null {
  if (!plan) return null;
  const lines = [`- Tables: ${plan.tables.map((t) => t.name).join(", ")}`];
  if (plan.decisions.length) {
    lines.push(`- Prior decisions: ${plan.decisions.join("; ")}`);
  }
  return `PREVIOUS APPROVED PLAN:\n${lines.join("\n")}`;
}

function preferencesSection(prefs?: Record<string, string>): string | null {
  if (!prefs || Object.keys(prefs).length === 0) return null;
  const lines = Object.entries(prefs)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return `USER PREFERENCES (hard rules, override defaults):\n${lines}`;
}

function constraintsSection(constraints?: string[]): string | null {
  if (!constraints || constraints.length === 0) return null;
  return `PROJECT CONSTRAINTS (hard rules, override defaults):\n${constraints
    .map((c) => `- ${c}`)
    .join("\n")}`;
}

function buildPlanningPrompt(params: {
  intentType: IntentType;
  entityName: string | null;
  isNewEntity: boolean;
  transcript: string;
  retrievedContext: string;
  techStack?: Record<string, string | null> | null;
  previousApprovedPlan?: TaskPlan | null;
  userPreferences?: Record<string, string>;
  projectConstraints?: string[];
  forcePlan?: boolean;
}): string {
  const {
    intentType,
    entityName,
    isNewEntity,
    transcript,
    retrievedContext,
    techStack,
    previousApprovedPlan,
    userPreferences,
    projectConstraints,
    forcePlan,
  } = params;

  const grounding = retrievedContext
    ? `EXISTING TABLES (from current schema):\n${retrievedContext}`
    : "No existing schema — this is a from-scratch request.";

  const entityNote = entityName
    ? isNewEntity
      ? `Target: "${entityName}" — does not exist yet, being created.`
      : `Target: "${entityName}" — already exists.`
    : "No specific entity named — applies to the schema as a whole.";

  const sections = [
    `You are a senior database architect deciding WHICH TABLES a request needs — nothing more. You do not design columns, types, constraints, or relationships here; that happens in a later stage, directly in DBML, where it's proven more accurate than planning it here first.

Intent: ${intentType} (generate=new schema, modify=general change, add=add table/column/index/constraint/relation, remove=remove objects, rename=rename table/column/index)

${entityNote}
${grounding}`,
    techStackSection(techStack),
    previousPlanSection(previousApprovedPlan),
    preferencesSection(userPreferences),
    constraintsSection(projectConstraints),
    `${transcript}

If this includes prior clarifying questions and answers above, treat them as established facts — the answers refine what was asked, they don't replace it.

Rules:
${
  forcePlan
    ? `- You may NOT ask a question now. Questions have already been asked, or the user wants you to go ahead. Make the most reasonable choice for anything still unstated and record each one in "decisions", starting with "Assumed:". Always output "tables".`
    : `- Ask a question ONLY when the missing answer would change WHICH TABLES are needed and you cannot pick a sensible default. Never ask about column details, naming, types, or things the tech stack or earlier answers already settle. When you can go ahead, do: make a reasonable choice and record it in "decisions", starting with "Assumed:". If you do ask, set needsClarification true and ask ONE specific question (never a generic "can you give more detail"), with suggestedOptions when there is a small natural answer set.`
}
- Otherwise, output "tables": every table this request needs, each with name (snake_case) and isNew. When the request adds a feature, always include the NEW tables it needs (isNew true) as well as any existing tables it connects to; never list only existing tables for something that is being added. For a narrow add/remove/rename on one existing table, this is usually just that one table with isNew:false. For "generate", list the full table set in dependency order.
- Output "decisions": plain-English rationale for judgment calls only — things that could genuinely have gone multiple ways. Do not record a decision for an existing table or an already-stated fact. Cap at 8.
- Do not include a table from EXISTING TABLES that this request has no reason to reference.

Respond with ONLY a JSON object, no other text:
{"confidence": 0.0-1.0, "needsClarification": true|false, "clarifyingQuestion": "..." (if needsClarification), "suggestedOptions": ["..."] (optional), "tables": [{"name": "...", "isNew": true|false}] (if not needsClarification), "decisions": ["..."] (if not needsClarification)}`,
  ];

  return sections.filter(Boolean).join("\n\n");
}

/**
 * Assembles the rich, sectioned prompt handed to Executor — same pattern as
 * the proven legacy generatePlan(): labeled sections, filtered to only what
 * applies, joined with blank lines. This prompt (not a bare instruction) is
 * what Executor actually generates DBML from.
 */
export function assembleGenerationPrompt(params: {
  transcript: string;
  tables: TablePlanEntry[];
  decisions: string[];
  retrievedContext: string;
  techStack?: Record<string, string | null> | null;
}): string {
  const { transcript, tables, decisions, retrievedContext, techStack } = params;

  const sections = [
    transcript,
    tables.length
      ? `TABLES:\n${tables.map((t) => `- ${t.name} (${t.isNew ? "new" : "existing"})`).join("\n")}`
      : null,
    decisions.length
      ? `DECISIONS:\n${decisions.map((d) => `- ${d}`).join("\n")}`
      : null,
    techStackSection(techStack),
    retrievedContext ? `EXISTING SCHEMA CONTEXT:\n${retrievedContext}` : null,
  ];

  return sections.filter(Boolean).join("\n\n");
}

function renderMarkdown(
  tables: TablePlanEntry[],
  decisions: string[],
  originalMessage: string
): string {
  const lines = [`# Plan for: ${originalMessage}`, "", "## Tables"];
  for (const t of tables)
    lines.push(`- **${t.name}** (${t.isNew ? "new" : "existing"})`);
  if (decisions.length) {
    lines.push("", "## Decisions");
    for (const d of decisions) lines.push(`- ${d}`);
  }
  return lines.join("\n");
}

export async function buildPlan(params: {
  model: SchemaModel;
  intentType: IntentType;
  entityName: string | null;
  isNewEntity: boolean;
  originalMessage: string; // clean, for display
  transcript: string; // original + clarification history, for the LLM
  retrievedContext: string;
  /** Committed tech stack — absent when not configured. */
  techStack?: Record<string, string | null> | null;
  /** Singular — most recent approved plan only, per ADR-0003. */
  previousApprovedPlan?: TaskPlan | null;
  userPreferences?: Record<string, string>;
  projectConstraints?: string[];
  /**
   * No more questions: plan with stated assumptions. Used once the user has
   * answered enough, or asked to go ahead.
   */
  forcePlan?: boolean;
}): Promise<BuildPlanResult> {
  const {
    forcePlan,
    intentType,
    entityName,
    isNewEntity,
    originalMessage,
    transcript,
    retrievedContext,
    techStack,
    previousApprovedPlan,
    userPreferences,
    projectConstraints,
    model,
  } = params;

  if (READ_ONLY_INTENTS.includes(intentType)) {
    return buildAnswer({
      entityName,
      intentType,
      model,
      retrievedContext,
      transcript,
    });
  }

  const { object: raw } = await model.generateObject({
    maxOutputTokens: 2000,
    prompt: transcript,
    schema: PlanSchema,
    system: buildPlanningPrompt({
      entityName,
      forcePlan,
      intentType,
      isNewEntity,
      previousApprovedPlan,
      projectConstraints,
      retrievedContext,
      techStack,
      transcript,
      userPreferences,
    }),
    tier: "capable",
  });

  const hasTables = Boolean(raw.tables && raw.tables.length > 0);

  // A specific question is worth asking, unless asking is no longer allowed.
  // Low confidence alone is not: with tables in hand, the plan goes ahead and
  // the user reviews it, instead of being asked something vague.
  if (!forcePlan && raw.needsClarification && raw.clarifyingQuestion) {
    return {
      clarifyingQuestion: raw.clarifyingQuestion,
      status: "needs_clarification",
      suggestedOptions: raw.suggestedOptions,
    };
  }
  if (!hasTables) {
    if (forcePlan) {
      throw new Error(
        "I could not turn that into a plan. Try describing the tables or features you want."
      );
    }
    // No tables and no specific question: asking something vague helps nobody.
    // Try again once, this time going ahead on stated assumptions.
    if (!raw.clarifyingQuestion) {
      return buildPlan({ ...params, forcePlan: true });
    }
    return {
      clarifyingQuestion: raw.clarifyingQuestion,
      status: "needs_clarification",
      suggestedOptions: raw.suggestedOptions,
    };
  }

  const MAX_DECISIONS = 8;
  const MAX_TABLES = 60;
  const decisions = (raw.decisions ?? []).slice(0, MAX_DECISIONS);
  const tables = (raw.tables ?? []).slice(0, MAX_TABLES);
  const generationPrompt = assembleGenerationPrompt({
    decisions,
    retrievedContext,
    tables,
    techStack,
    transcript,
  });

  const plan: TaskPlan = {
    decisions,
    entityName,
    generationPrompt,
    id: globalThis.crypto.randomUUID(),
    operationType: intentType,
    originalPrompt: originalMessage,
    tables,
    techStack,
  };

  return {
    plan,
    planMarkdown: renderMarkdown(tables, decisions, originalMessage),
    status: "ready",
  };
}
