import type { IntentType, RetrievalPlan } from "./types";

export function planRetrieval(params: {
  intentType: IntentType;
  entityId: string | null;
  isNewEntity: boolean;
}): RetrievalPlan {
  const { intentType, entityId, isNewEntity } = params;

  // Pure creation, nothing exists yet — nothing to retrieve.
  if (intentType === "generate" && entityId === null) {
    return { includeReverseFKs: false, mode: "none" };
  }

  // "add a column to posts" — new field, but grounded on a real existing entity.
  if (intentType === "add" && entityId !== null && !isNewEntity) {
    return { hopDepth: 1, includeReverseFKs: false, mode: "neighborhood" };
  }

  // "remove"/"rename" on a real entity need to know what depends on it
  // before acting — same depth as impact-check reasoning, since these are
  // all "what breaks" questions. (migrate deferred, not yet classified.)
  if (
    entityId !== null &&
    (intentType === "remove" || intentType === "rename")
  ) {
    return { hopDepth: 2, includeReverseFKs: true, mode: "neighborhood" };
  }

  if (
    entityId !== null &&
    (intentType === "modify" ||
      intentType === "inspect" ||
      intentType === "validate")
  ) {
    return { hopDepth: 1, includeReverseFKs: false, mode: "neighborhood" };
  }

  // No entity, and it's a genuine whole-schema question ("validate my schema",
  // "inspect for normalization issues" — Entity Resolver already returned
  // not_applicable in this case, never ambiguous/not_found, since those
  // short-circuit before this stage runs).
  if (entityId === null) {
    return { includeReverseFKs: false, mode: "whole_schema_outline" };
  }

  return { hopDepth: 1, includeReverseFKs: false, mode: "neighborhood" };
}
