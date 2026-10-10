import type { NormalizedSchema } from "@enops/atlas-schema";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { buildSchemaContext as buildGraphContext } from "../llm-agent/schema-context";
import type { GraphRetrieverOutput, RetrievalPlan, SchemaIR } from "./types";

const DEFAULT_MAX_NODES = 40;

/** SchemaIR.rawDbml → CanonicalSchema, or null when it can't be parsed. */
function toCanonical(rawDbml: string) {
  if (!rawDbml.trim()) return null;
  let normalized: NormalizedSchema;
  try {
    normalized = parseDbml(rawDbml);
  } catch {
    return null;
  }
  const { schema: canonical, errors } = normalize(normalized);
  if (errors.length > 0 || canonical.tables.length === 0) return null;
  return canonical;
}

/**
 * Resolves an entityId ("table" or "table.column") to graph tableKeys,
 * matching across pg schemas (a plain name in a multi-schema database
 * resolves to every table with that name).
 */
function toTableKeys(
  canonicalTables: Array<{ name: string; schema: string }>,
  entityId: string
): string[] {
  const [root] = entityId.split(".");
  return canonicalTables
    .filter((t) => t.name === root)
    .map((t) => `${t.schema}.${t.name}`);
}

/**
 * Graph context retrieval — REAL implementation, wired to the in-package
 * graph engine (dbml/parse → canonical → graph → neighborhood →
 * serializeNeighborhood). Replaces the earlier TODO stubs.
 *
 * plan.mode "none": nothing to retrieve (pure from-scratch generate).
 * "whole_schema_outline": every table, edges between in-scope tables only.
 * "neighborhood": N-hop BFS around the resolved entity, both directions
 * (FK and reverse-FK) — includeReverseFKs is inherent to the traversal.
 */
export async function retrieveGraph(
  plan: RetrievalPlan,
  entityId: string | null,
  schema: SchemaIR
): Promise<GraphRetrieverOutput> {
  if (plan.mode === "none") {
    return { context: "", nodeIds: [] };
  }

  const canonical = toCanonical(schema.rawDbml);
  if (!canonical) {
    return { context: "", nodeIds: [] };
  }

  if (plan.mode === "whole_schema_outline") {
    const allKeys = canonical.tables.map((t) => `${t.schema}.${t.name}`);
    const { context, scope } = buildGraphContext(canonical, allKeys, {
      hops: 0, // no expansion — everything is already in scope
      maxNodes: Math.max(allKeys.length, DEFAULT_MAX_NODES),
    });
    return { context, nodeIds: [...scope] };
  }

  // mode === "neighborhood"
  if (!entityId) {
    return { context: "", nodeIds: [] };
  }

  const focusKeys = toTableKeys(canonical.tables, entityId);
  if (focusKeys.length === 0) {
    return { context: "", nodeIds: [] };
  }

  const { context, scope } = buildGraphContext(canonical, focusKeys, {
    hops: plan.hopDepth ?? 2,
    maxNodes: DEFAULT_MAX_NODES,
  });
  return { context, nodeIds: [...scope] };
}
