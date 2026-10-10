import type { CanonicalSchema } from "@enops/atlas-schema";
import type { DanglingEdgeError, Edge, SchemaGraph } from "./types";
import { tableKey } from "./types";

export interface BuildGraphResult {
  danglingEdges: DanglingEdgeError[];
  graph: SchemaGraph;
}

/**
 * Builds an in-memory graph over CanonicalSchema. Pure, no I/O, safe
 * to rebuild on every call — CanonicalSchema for a real schema is a
 * few hundred tables at most, so this is sub-millisecond.
 */
export function buildSchemaGraph(schema: CanonicalSchema): BuildGraphResult {
  const nodes: SchemaGraph["nodes"] = new Map();
  const adjacency: SchemaGraph["adjacency"] = new Map();
  const reverseAdjacency: SchemaGraph["reverseAdjacency"] = new Map();
  const danglingEdges: DanglingEdgeError[] = [];

  for (const table of schema.tables) {
    const key = tableKey(table.schema, table.name);
    nodes.set(key, {
      columns: table.columns,
      key,
      name: table.name,
      schema: table.schema,
      table,
    });
    adjacency.set(key, []);
    reverseAdjacency.set(key, []);
  }

  for (const table of schema.tables) {
    const fromKey = tableKey(table.schema, table.name);
    for (const fk of table.foreignKeys) {
      const toKey = tableKey(fk.refTable.schema, fk.refTable.table);
      const edge: Edge = { fk, from: fromKey, to: toKey };

      const fromExists = nodes.has(fromKey);
      const toExists = nodes.has(toKey);

      if (!fromExists)
        danglingEdges.push({ edge, kind: "dangling-edge", missing: "from" });
      if (!toExists)
        danglingEdges.push({ edge, kind: "dangling-edge", missing: "to" });
      if (!(fromExists && toExists)) continue;

      adjacency.get(fromKey)!.push(edge);
      reverseAdjacency.get(toKey)!.push(edge);
    }
  }

  const edgeKey = (edge: Edge) =>
    JSON.stringify([
      edge.from,
      edge.to,
      edge.fk.name ?? "",
      edge.fk.columns,
      edge.fk.refColumns,
      edge.fk.cardinality,
      edge.fk.onDelete,
      edge.fk.onUpdate,
    ]);
  for (const edges of adjacency.values())
    edges.sort((a, b) =>
      edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0
    );
  for (const edges of reverseAdjacency.values())
    edges.sort((a, b) =>
      edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0
    );

  return {
    danglingEdges,
    graph: {
      adjacency,
      ...(schema.databaseType ? { databaseType: schema.databaseType } : {}),
      dialect: schema.dialect ?? "unknown",
      enums: schema.enums,
      nodes,
      reverseAdjacency,
      version: schema.version ?? null,
    },
  };
}
