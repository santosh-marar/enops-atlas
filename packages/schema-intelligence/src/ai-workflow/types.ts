// AI Workflow — shared types

export type IntentType =
  | "generate" // create a new schema from requirements
  | "modify" // change an existing schema
  | "add" // add table, column, index, constraint, relation
  | "remove" // remove schema objects
  | "rename" // rename table/column/index/etc
  | "inspect" // explain or analyze the existing schema
  | "validate" // check schema correctness/problems
  | "migrate" // generate/apply migration from schema changes
  | "unknown";

export interface IntentResolverOutput {
  intentConfidence: number; // 0–1
  intentType: IntentType;
}

export type EntityType = "table" | "column" | "relationship";

export type EntityResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "not_applicable";

export interface EntityResolverOutput {
  candidates?: string[]; // populated when status === "ambiguous"
  entityConfidence: number; // 0–1, 0 when status !== "resolved"
  entityName: string | null; // e.g. "posts" or "posts.author_id"
  entityType: EntityType | null;
  isNewEntity: boolean;
  rawEntityMention?: string;
  resolvedVia: "primary" | "fallback"; // which pass resolved it, for observability
  status: EntityResolutionStatus;
}

export interface ContextResolverOutput {
  entityId: string | null;
  scopedSchemaVersion: string;
}

export interface RetrievalPlan {
  hopDepth?: number;
  includeReverseFKs: boolean;
  mode: "none" | "neighborhood" | "whole_schema_outline";
}

export interface GraphRetrieverOutput {
  context: string; // outline-notation serialization
  nodeIds: string[];
}

// Minimal shape Entity/Context/Retrieval/Graph stages need from SchemaIR.
// Replace with the real @enops/atlas-schema-ir type once wired in.
export interface SchemaIR {
  rawDbml: string; // used only by the entity-resolver fallback pass, see note there
  schemaId: string;
  schemaVersion: string;
  tables: Array<{
    name: string;
    columns: Array<{ name: string }>;
  }>;
}

export interface GenerationOutput {
  clarifyingQuestion?: string;
  confidence: number;
  dbmlFragment?: string; // the generated/changed DBML, ungrounded until Validator checks it
  status: "ok" | "needs_clarification";
}

export interface ValidationOutput {
  errors: string[];
  status: "valid" | "invalid";
}

/** WHICH tables a plan involves, never their shape — decided at Executor, in DBML. */
export interface TablePlanEntry {
  isNew: boolean;
  name: string;
}

export interface TaskPlan {
  /** Plain-English rationale for judgment calls only. */
  decisions: string[];
  /** The table the request is focused on, when Entity Resolver found one. */
  entityName: string | null;
  /** Frozen assembled prompt — Executor regenerates from final plan fields. */
  generationPrompt: string;
  id: string;
  operationType: IntentType; // intentType already IS the operation category now
  originalPrompt: string;
  tables: TablePlanEntry[];
  /**
   * Committed tech stack (database, orm, language, authLibrary,
   * billingLibrary, …) — serialized as-is from project_tech_stack. Optional:
   * absent on flows that haven't configured a stack yet.
   */
  techStack?: Record<string, string | null> | null;
}

export interface ClarificationRound {
  answer: string;
  question: string;
}

export type BuildPlanResult =
  | {
      status: "needs_clarification";
      clarifyingQuestion: string;
      suggestedOptions?: string[];
    }
  | { status: "answered"; content: string }
  | { status: "ready"; plan: TaskPlan; planMarkdown: string };

export type PipelineResult =
  | { kind: "needs_clarification"; message: string; candidates: string[] }
  | { kind: "needs_entity"; message: string }
  | { kind: "ok"; result: unknown }; // narrowed once Task Planner/Executor land
