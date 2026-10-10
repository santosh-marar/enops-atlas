import { buildSchemaGraph, tableKey } from "@enops/atlas-graph";
import { normalize, parseDbml } from "@enops/atlas-schema";

/**
 * The one place the web app parses DBML. Every feature reads the canonical
 * schema and graph from here instead of re-parsing on its own.
 */
export function analyzeDbml(dbml: string) {
  const parsed = parseDbml(dbml);
  const { schema: canonical, errors: normalizeErrors } = normalize(parsed);
  const { graph, danglingEdges } = buildSchemaGraph(canonical);
  return { canonical, danglingEdges, graph, normalizeErrors, parsed };
}

export type AtlasAnalysis = ReturnType<typeof analyzeDbml>;

export { tableKey };
