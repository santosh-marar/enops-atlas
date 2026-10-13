import {
  buildTranscript,
  type ClarificationRound,
  getEntityNameIndex,
  planRetrieval,
  resolveContext,
  retrieveGraph,
  type SchemaIR,
  type TaskPlan,
} from "@enops/atlas-schema-intelligence";
import {
  buildPlan,
  resolveEntity,
  resolveIntent,
  type SchemaModel,
} from "@enops/atlas-schema-intelligence/ai";
import { analyzeDbml } from "@/lib/atlas";
import { type PlanStep, planRequest } from "./schema-flow";

/** A plan step that also carries the graph context the plan was made from. */
export type EditStep =
  | Exclude<PlanStep, { kind: "plan" }>
  | {
      kind: "plan";
      markdown: string;
      plan: TaskPlan;
      /** Pass this to generateFromPlan so the writer sees the same neighbourhood. */
      retrievedContext: string;
    };

/** The small view of the schema the AI steps work from. */
export function toSchemaIR(dbml: string): SchemaIR {
  const { canonical } = analyzeDbml(dbml);
  return {
    rawDbml: dbml,
    schemaId: "current",
    schemaVersion: "1",
    tables: canonical.tables.map((table) => ({
      columns: table.columns.map((column) => ({ name: column.name })),
      name: table.name,
    })),
  };
}

/** Names the user can @-mention: "posts" and "posts.author_id". */
export function mentionSuggestions(dbml: string, fragment: string): string[] {
  const text = fragment.toLowerCase();
  try {
    return getEntityNameIndex(toSchemaIR(dbml))
      .filter((name) => name.toLowerCase().includes(text))
      .slice(0, 6);
  } catch {
    return [];
  }
}

const PRONOUNS = new Set([
  "it",
  "this",
  "that",
  "them",
  "these",
  "those",
  "here",
]);

/** True when the user actually named something, rather than saying "it". */
const isNamed = (mention?: string) =>
  Boolean(mention && !PRONOUNS.has(mention.trim().toLowerCase()));

/** Most questions asked before the plan goes ahead on stated assumptions. */
export const MAX_QUESTIONS = 2;

const GO_AHEAD =
  /\b(just (do|make|build|create|generate)|go ahead|you (decide|choose|pick)|up to you|your (call|choice)|don'?t ask|stop asking|no more questions|make (a |the |me a )?schema|proceed|whatever)\b/i;

/**
 * True when the assistant should stop asking: it has already asked enough, or
 * the user said to go ahead. The plan then lists what it assumed.
 */
export function shouldStopAsking(history: ClarificationRound[]): boolean {
  return (
    history.length >= MAX_QUESTIONS ||
    history.some((round) => GO_AHEAD.test(round.answer))
  );
}

/**
 * Step 1 for a request about an existing schema. Works out what the user means
 * (intent, then which table or column), looks only at the part of the schema
 * around it, and proposes a plan. Asks instead of guessing when it is unsure.
 */
export async function planEdit(input: {
  dbml: string;
  /** Earlier questions and the user's answers, oldest first. */
  history?: ClarificationRound[];
  message: string;
  model: SchemaModel;
  /** Called as each step starts, so the chat can show what is happening. */
  onProgress?: (step: string) => void;
  techStack?: Record<string, string | null> | null;
}): Promise<EditStep> {
  const history = input.history ?? [];
  const forcePlan = shouldStopAsking(history);
  // The request together with every answer so far, so no step starts over.
  const request = buildTranscript(input.message, history);

  // Nothing to edit yet: this is a new schema.
  if (input.dbml.trim().length === 0) {
    input.onProgress?.("Planning the new schema");
    const step = await planRequest({ ...input, forcePlan, history });
    return step.kind === "plan" ? { ...step, retrievedContext: "" } : step;
  }

  const schema = toSchemaIR(input.dbml);
  input.onProgress?.("Understanding your request");
  const { intentType } = await resolveIntent(request, input.model);
  input.onProgress?.(
    `It reads as a "${intentType}" request: finding what it touches`
  );
  const resolved = await resolveEntity(
    request,
    intentType,
    schema,
    input.model
  );
  // Once asking has stopped, an unclear table means the whole schema, not
  // another question.
  // "add notifications on it" names nothing to look up, so there is nothing to
  // ask about: a new feature goes in as a plan over the whole schema.
  const namesNothing =
    resolved.status === "not_found" &&
    !isNamed(resolved.rawEntityMention) &&
    (intentType === "add" ||
      intentType === "modify" ||
      intentType === "generate");
  const entity =
    (forcePlan &&
      (resolved.status === "ambiguous" || resolved.status === "not_found")) ||
    namesNothing
      ? {
          ...resolved,
          entityName: null,
          isNewEntity: false,
          status: "not_applicable" as const,
        }
      : resolved;

  if (entity.status === "ambiguous") {
    return {
      kind: "question",
      options: entity.candidates,
      text: `Which one do you mean${entity.rawEntityMention ? ` by "${entity.rawEntityMention}"` : ""}?`,
    };
  }
  if (entity.status === "not_found") {
    return {
      kind: "question",
      options: getEntityNameIndex(schema).filter((name) => !name.includes(".")),
      text: "I could not find that in your schema. Which table do you mean?",
    };
  }

  const { entityId } = resolveContext(entity.entityName, schema);
  input.onProgress?.(
    entity.entityName
      ? `Reading ${entity.entityName} and the tables around it`
      : "Reading the whole schema"
  );
  const retrieval = planRetrieval({
    entityId,
    intentType,
    isNewEntity: entity.isNewEntity,
  });
  const { context } = await retrieveGraph(retrieval, entityId, schema);

  input.onProgress?.(
    entity.entityName
      ? `Planning the change to ${entity.entityName}`
      : "Planning the change"
  );
  const result = await buildPlan({
    entityName: entity.entityName,
    forcePlan,
    intentType,
    isNewEntity: entity.isNewEntity,
    model: input.model,
    originalMessage: input.message,
    retrievedContext: context,
    techStack: input.techStack,
    transcript: request,
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
  return {
    kind: "plan",
    markdown: result.planMarkdown,
    plan: result.plan,
    retrievedContext: context,
  };
}
