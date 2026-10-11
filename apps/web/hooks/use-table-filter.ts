import type { CanonicalSchema } from "@enops/atlas-schema";
import type { Edge, Node } from "@xyflow/react";
import { useMemo } from "react";
import { analyzeDbml, tableKey, tableKeyOfNode } from "@/lib/atlas";
import { useSchemaStore } from "@/store/use-schema-store";

/**
 * Table keys matching the query, best match first: an exact table name, an
 * exact column name, then partial table and column names. A query that is
 * part of a schema name also matches that schema's tables.
 */
export function searchTables(schema: CanonicalSchema, query: string): string[] {
  const text = query.trim().toLowerCase();
  if (!text) return [];

  const scored: { key: string; score: number }[] = [];
  for (const table of schema.tables) {
    const name = table.name.toLowerCase();
    const columns = table.columns.map((column) => column.name.toLowerCase());
    let score = 0;
    if (name === text) score = 100;
    else if (columns.includes(text)) score = 90;
    else if (name.includes(text)) score = 60;
    else if (columns.some((column) => column.includes(text))) score = 40;
    else if (table.schema.toLowerCase().includes(text)) score = 20;
    if (score > 0) {
      scored.push({ key: tableKey(table.schema, table.name), score });
    }
  }

  return scored.sort((a, b) => b.score - a.score).map((hit) => hit.key);
}

export function useTableFilter(
  nodes: Node[],
  edges: Edge[],
  searchQuery: string
) {
  const dbml = useSchemaStore((state) => state.dbml);

  // Parsed only when the schema changes, not on every keystroke.
  const schema = useMemo(() => {
    try {
      return analyzeDbml(dbml).canonical;
    } catch {
      return null;
    }
  }, [dbml]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    if (!schema) return [];
    const matches = new Set(searchTables(schema, searchQuery));
    return nodes.filter((node) => matches.has(tableKeyOfNode(node)));
  }, [schema, nodes, searchQuery]);

  // Filter edges to only show connections between visible nodes
  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((node) => node.id));
    return edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
    );
  }, [edges, filteredNodes]);

  return { filteredEdges, filteredNodes };
}
