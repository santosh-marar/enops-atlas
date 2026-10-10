import {
  buildSchemaGraph,
  getNeighborhood,
  serializeNeighborhood,
} from "@enops/atlas-graph";
import type { CanonicalSchema } from "@enops/atlas-schema";
import { validateCanonicalStructure } from "@enops/atlas-schema";

export interface SchemaContextOptions {
  hops?: number;
  maxNodes?: number;
}

export interface SchemaContextResult {
  context: string;
  scope: Set<string>; // tableKeys included
  truncated: boolean;
}

/**
 * The general-purpose "give an LLM just enough schema to reason about
 * this" function — not specific to impact analysis. Any LLM call that
 * needs schema context (refinement, codegen review, explanation)
 * should scope through this rather than serializing the whole schema.
 */
export function buildSchemaContext(
  schema: CanonicalSchema,
  focusTables: string[], // tableKeys, e.g. ["public.orders"]
  options: SchemaContextOptions = {}
): SchemaContextResult {
  if (schema.version !== 2)
    throw new Error(
      "Schema reasoning requires canonical v2; reparse the authoritative source"
    );
  const issues = validateCanonicalStructure(schema);
  if (issues.length)
    throw new Error(
      `Invalid canonical schema graph: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`
    );
  const { hops = 2, maxNodes = 40 } = options;
  const { graph } = buildSchemaGraph(schema);
  const { tables: scope, truncated } = getNeighborhood(graph, focusTables, {
    hops,
    maxNodes,
  });
  return { context: serializeNeighborhood(graph, scope), scope, truncated };
}
