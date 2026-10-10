import {
  buildSchemaChunks,
  hybridSchemaSearch,
  type SchemaChunk,
} from "@enops/atlas-schema-intelligence";
import type { Edge, Node } from "@xyflow/react";
import { useMemo } from "react";
import { analyzeDbml, tableKey, tableKeyOfNode } from "@/lib/atlas";
import { useSchemaStore } from "@/store/use-schema-store";

const MAX_HITS = 200;

/**
 * Table keys matching the query, best match first. Names are ranked by the
 * shared search; a query that is part of a schema name also matches that
 * schema's tables.
 */
export function searchTables(chunks: SchemaChunk[], query: string): string[] {
  const text = query.trim();
  if (!text) return [];

  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const keys: string[] = [];
  const add = (key: string) => {
    if (!keys.includes(key)) keys.push(key);
  };

  for (const hit of hybridSchemaSearch({
    chunks,
    limit: MAX_HITS,
    query: text,
  })) {
    const chunk = byId.get(hit.chunkId);
    if (chunk?.table) add(tableKey(chunk.schema, chunk.table));
  }

  const lower = text.toLowerCase();
  for (const chunk of chunks) {
    if (chunk.kind === "table" && chunk.schema.toLowerCase().includes(lower)) {
      add(tableKey(chunk.schema, chunk.name));
    }
  }

  return keys;
}

export function useTableFilter(
  nodes: Node[],
  edges: Edge[],
  searchQuery: string
) {
  const dbml = useSchemaStore((state) => state.dbml);

  // Rebuilt only when the schema changes, not on every keystroke.
  const chunks = useMemo(() => {
    try {
      return buildSchemaChunks(analyzeDbml(dbml).canonical);
    } catch {
      return [];
    }
  }, [dbml]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const matches = new Set(searchTables(chunks, searchQuery));
    return nodes.filter((node) => matches.has(tableKeyOfNode(node)));
  }, [chunks, nodes, searchQuery]);

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
