import { checkDiffScope, diffSchemas } from "@enops/atlas-schema";
import type { TaskPlan } from "@enops/atlas-schema-intelligence";
import {
  buildPlan,
  generateDbmlFromPlan,
  type SchemaModel,
} from "@enops/atlas-schema-intelligence/ai";

/** What the chat shows after a request: a question, an answer, or a plan to approve. */
export type PlanStep =
  | { kind: "question"; options?: string[]; text: string }
  | { kind: "answer"; text: string }
  | { kind: "plan"; markdown: string; plan: TaskPlan };

export interface Proposal {
  attempts: number;
  /** The schema as DBML. Only apply it when `valid` is true. */
  dbml: string;
  /** Tables the change touched that the approved plan did not mention. */
  outsidePlan: string[];
  /** Why it is not valid, in plain words. Empty when valid. */
  problems: string[];
  valid: boolean;
}

import { analyzeDbml } from "../atlas";

type TechStack = Record<string, string | null> | null;

/** Step 1: understand the request and propose which tables are involved. Nothing changes yet. */
export async function planRequest(input: {
  dbml: string;
  message: string;
  model: SchemaModel;
  techStack?: TechStack;
}): Promise<PlanStep> {
  const isNewSchema = input.dbml.trim().length === 0;
  const result = await buildPlan({
    entityName: null,
    intentType: isNewSchema ? "generate" : "modify",
    isNewEntity: isNewSchema,
    model: input.model,
    originalMessage: input.message,
    retrievedContext: "",
    techStack: input.techStack,
    transcript: input.message,
  });

  if (result.status === "needs_clarification") {
    return {
      kind: "question",
      options: result.suggestedOptions,
      text: result.clarifyingQuestion,
    };
  }
  if (result.status === "answered") {
    return { kind: "answer", text: result.content };
  }
  return { kind: "plan", markdown: result.planMarkdown, plan: result.plan };
}

/**
 * Step 2, after the user approved the plan: write the DBML. The package parses
 * and validates it (and retries) before this returns; an invalid result is
 * reported, never handed to the editor.
 */
export async function generateFromPlan(input: {
  dbml: string;
  model: SchemaModel;
  plan: TaskPlan;
  retrievedContext?: string;
}): Promise<Proposal> {
  const result = await generateDbmlFromPlan({
    existingDbml: input.dbml,
    model: input.model,
    plan: input.plan,
    retrievedContext: input.retrievedContext,
  });

  const problems = [
    ...result.parseErrors,
    ...result.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message),
    ...result.normalizeErrors.map((issue) => issue.message),
  ];

  return {
    attempts: result.attempts,
    dbml: result.dbml,
    outsidePlan: result.canonical
      ? tablesOutsidePlan(input.dbml, result.canonical, input.plan)
      : [],
    problems,
    valid: result.valid && !result.parseFailed,
  };
}

/**
 * The model writes the whole schema, so it could change tables it was not asked
 * to. Compare with the schema before and list every table that changed but is
 * not in the approved plan.
 */
function tablesOutsidePlan(
  beforeDbml: string,
  after: Parameters<typeof diffSchemas>[1],
  plan: TaskPlan
): string[] {
  if (beforeDbml.trim().length === 0) return [];
  try {
    const before = analyzeDbml(beforeDbml).canonical;
    const named = new Set(plan.tables.map((table) => table.name));
    const expected = [...before.tables, ...after.tables]
      .filter((table) => named.has(table.name))
      .map((table) => `${table.schema}.${table.name}`);
    return checkDiffScope(diffSchemas(before, after), expected)
      .unexpectedTables;
  } catch {
    return [];
  }
}
