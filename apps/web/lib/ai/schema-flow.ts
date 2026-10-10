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
  /** Why it is not valid, in plain words. Empty when valid. */
  problems: string[];
  valid: boolean;
}

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
}): Promise<Proposal> {
  const result = await generateDbmlFromPlan({
    existingDbml: input.dbml,
    model: input.model,
    plan: input.plan,
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
    problems,
    valid: result.valid && !result.parseFailed,
  };
}
