// Browser-safe, deterministic schema engine and the AI workflow.
// The shared IR now lives in @enops/atlas-schema and the graph in @enops/atlas-graph;
// this package re-exports them alongside the AI/workflow layers.

export * from "@enops/atlas-graph";
export * from "@enops/atlas-schema";
export { resolveContext } from "./ai-workflow/context-resolver";
export { getEntityNameIndex } from "./ai-workflow/entity-name-index";
export { retrieveGraph } from "./ai-workflow/graph-retriever";
export { planRetrieval } from "./ai-workflow/retrieval-planner";
export { buildTranscript } from "./ai-workflow/transcript";
export type {
  BuildPlanResult,
  ClarificationRound,
  ContextResolverOutput,
  EntityResolutionStatus,
  EntityResolverOutput,
  EntityType,
  GenerationOutput,
  GraphRetrieverOutput,
  IntentResolverOutput,
  IntentType,
  PipelineResult,
  RetrievalPlan,
  SchemaIR,
  TablePlanEntry,
  TaskPlan,
  ValidationOutput,
} from "./ai-workflow/types";
// Confidence scoring
export {
  type ConfidenceIssue,
  type ConfidenceIssueKind,
  type SchemaConfidence,
  scoreSchema,
} from "./confidence/score";
export { directDbmlDigest, normalizeDirectDbml } from "./direct-dbml";
export { buildSchemaContext } from "./llm-agent/schema-context";
export type {
  SchemaModel,
  SchemaModelMessage,
  SchemaModelRequest,
} from "./model";
export {
  type BuildSchemaChunksOptions,
  buildSchemaChunks,
  type SchemaChunk,
  type SchemaChunkKind,
} from "./rag/chunks";
export * from "./rag/rank";
export {
  SCHEMA_SNAPSHOT_VERSION,
  schemaChanges,
  schemaSnapshot,
} from "./schema-snapshot";
export {
  checkDirectionSanity,
  type DirectionFlag,
  type DirectionFlagReason,
  type DirectionSanityResult,
} from "./validator/direction-sanity";
export {
  type ValidationIssue,
  type ValidationResult,
  validate,
} from "./validator/validator";
