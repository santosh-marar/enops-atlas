import type { NormalizedSchema } from "@enops/atlas-schema";
import { normalize, parseDbml } from "@enops/atlas-schema";
import {
  type GenerateSchemaDbmlResult,
  generateDbmlPipeline,
} from "../ai/generate-schema-dbml";
import { buildSchemaContext as buildGraphContext } from "../llm-agent/schema-context";
import type { SchemaModel } from "../model";
import { assembleGenerationPrompt } from "./build-plan";
import type { TaskPlan } from "./types";

/**
 * Graph context retrieval at generation time — the neighborhood of the
 * EXISTING schema around the tables this plan touches (plus the focused
 * entity, when the flow resolved one). Computed FRESH here from existingDbml
 * rather than reused from planning time: the schema may have changed between
 * plan approval and execution, and the executor must never reason against a
 * stale graph.
 *
 * Gives the model relationship-shaped context: which tables connect to
 * which, through which FK columns, with what cardinality.
 */
function buildGraphContextSuffix(
  plan: TaskPlan,
  existingDbml?: string
): string {
  if (!existingDbml?.trim()) return "";

  let normalized: NormalizedSchema;
  try {
    normalized = parseDbml(existingDbml);
  } catch {
    return "";
  }
  const { schema: canonical, errors } = normalize(normalized);
  if (errors.length > 0 || canonical.tables.length === 0) return "";

  // Resolve plan table names (and the focused entity, "table" or
  // "table.column") to graph tableKeys.
  const byName = new Map<string, string[]>();
  for (const t of canonical.tables) {
    const names = byName.get(t.name) ?? [];
    names.push(`${t.schema}.${t.name}`);
    byName.set(t.name, names);
  }

  const focusNames = plan.tables.map((t) => t.name);
  if (plan.entityName) {
    const [root] = plan.entityName.split(".");
    if (root) focusNames.push(root);
  }

  const focusKeys = [
    ...new Set(focusNames.flatMap((name) => byName.get(name) ?? [])),
  ];
  if (focusKeys.length === 0) return "";

  const { context } = buildGraphContext(canonical, focusKeys, {
    hops: 2,
    maxNodes: 40,
  });
  if (!context) return "";

  return [
    "EXISTING SCHEMA GRAPH (tables connected to the ones in this plan):",
    context,
    "Use this to get relationships right — foreign keys must point at",
    "columns that actually exist, with the correct cardinality.",
  ].join("\n");
}

function buildExtrasSuffix(params: {
  conversationSummary?: string;
  userPreferences?: Record<string, string>;
  projectConstraints?: string[];
}): string {
  const parts: string[] = [];
  if (params.conversationSummary) {
    parts.push(
      `CONVERSATION CONTEXT SINCE THIS PLAN WAS APPROVED:\n${params.conversationSummary}`
    );
  }
  if (
    params.userPreferences &&
    Object.keys(params.userPreferences).length > 0
  ) {
    const lines = Object.entries(params.userPreferences)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");
    parts.push(`USER PREFERENCES (hard rules, override defaults):\n${lines}`);
  }
  if (params.projectConstraints && params.projectConstraints.length > 0) {
    parts.push(
      `PROJECT CONSTRAINTS (hard rules, override defaults):\n${params.projectConstraints
        .map((c) => `- ${c}`)
        .join("\n")}`
    );
  }
  return parts.join("\n\n");
}

/**
 * THE DBML executor — one door in (the approved TaskPlan), one door out
 * (validated DBML + confidence + sanity flags). No clarification, no
 * confidence check, no judgment calls: those happened at Task Planner; by
 * the time this runs, the plan is final.
 *
 * Merged from the two former executors — the good of each:
 * - From ai-workflow/generate-dbml.ts: reassembles the prompt from the
 *   plan's FINAL fields (never trusts the frozen generationPrompt preview —
 *   the user may have edited tables/decisions before approving).
 * - From ai/generate-schema-dbml.ts: fresh graph context around the plan's
 *   tables, the CURRENT DATABASE SCHEMA block with the complete-updated-
 *   schema instruction (never drop existing tables), and the generation-time
 *   extras (conversation summary / preferences / constraints).
 *
 * Generation itself runs through the ONE shared engine
 * (generateDbmlPipeline): generate → parse → validate → retry →
 * normalize → direction-sanity → confidence-score.
 */
export async function generateDbmlFromPlan(params: {
  model: SchemaModel;
  plan: TaskPlan;
  existingDbml?: string;
  retrievedContext?: string;
  conversationSummary?: string;
  userPreferences?: Record<string, string>;
  projectConstraints?: string[];
}): Promise<GenerateSchemaDbmlResult> {
  const {
    plan,
    existingDbml,
    retrievedContext,
    conversationSummary,
    userPreferences,
    projectConstraints,
  } = params;

  const prompt = [
    assembleGenerationPrompt({
      decisions: plan.decisions,
      retrievedContext: retrievedContext ?? "",
      tables: plan.tables,
      techStack: plan.techStack,
      transcript: plan.originalPrompt,
    }),
    buildGraphContextSuffix(plan, existingDbml),
    buildExtrasSuffix({
      conversationSummary,
      projectConstraints,
      userPreferences,
    }),
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = `You generate DBML (Database Markup Language) from an approved, finalized plan. The plan has already been reviewed and approved by the user — do not second-guess the table list or decisions, only execute them precisely in valid DBML.

${
  existingDbml?.trim()
    ? `CURRENT DATABASE SCHEMA (complete DBML of the existing version):
\`\`\`dbml
${existingDbml}
\`\`\`
OUTPUT THE COMPLETE UPDATED SCHEMA: reproduce every existing table exactly as shown above (applying only what this plan calls for), and add any NEW tables from the plan. Do not omit any existing table from your output.`
    : "No existing DBML — this is a from-scratch generation. Output the complete schema. For tables marked (existing), do NOT emit Table blocks — only Ref statements if a new table's foreign key points into them."
}

Every NEW table automatically needs an "id" column as uuid primary key:
  id uuid [pk, default: \`gen_random_uuid()\`]

RELATION DIRECTION IS CRITICAL. In DBML, "Ref: posts.user_id > users.id" means
MANY posts belong to ONE user — the ">" points FROM the many side's FK column
TO the one side's primary key. The FK column always lives on the MANY side,
and the arrow points from the FK to the PK it references.

Use snake_case for all table and column names. Add created_at and updated_at
timestamp columns to every NEW table unless the domain clearly doesn't need them.

If the prompt includes PROJECT CONSTRAINTS or USER PREFERENCES sections,
treat those as hard rules that override your own defaults.

Output ONLY valid DBML — no markdown fences, no commentary, no explanation.`;

  return generateDbmlPipeline({
    model: params.model,
    prompt,
    system,
  });
}
