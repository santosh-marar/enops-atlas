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
  techStack?: Record<string, string | null> | null;
}): Promise<EditStep> {
  // Nothing to edit yet: this is a new schema.
  if (input.dbml.trim().length === 0) {
    const step = await planRequest(input);
    return step.kind === "plan" ? { ...step, retrievedContext: "" } : step;
  }

  const schema = toSchemaIR(input.dbml);
  const { intentType } = await resolveIntent(input.message, input.model);
  const entity = await resolveEntity(
    input.message,
    intentType,
    schema,
    input.model
  );

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
  const retrieval = planRetrieval({
    entityId,
    intentType,
    isNewEntity: entity.isNewEntity,
  });
  const { context } = await retrieveGraph(retrieval, entityId, schema);

  const result = await buildPlan({
    entityName: entity.entityName,
    intentType,
    isNewEntity: entity.isNewEntity,
    model: input.model,
    originalMessage: input.message,
    retrievedContext: context,
    techStack: input.techStack,
    transcript: buildTranscript(input.message, input.history ?? []),
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
