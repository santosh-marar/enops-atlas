import type { ContextResolverOutput, SchemaIR } from "./types";

/**
 * Resolves the focused entity to the id the graph stage can use, scoped to
 * the schema version it was resolved against.
 *
 * Real implementation (no longer a passthrough): extracts the root table
 * from "table" or "table.column", verifies it actually exists in the
 * schema, and returns null when it doesn't — so graph retrieval never
 * receives a focus that can't resolve to a node.
 */
export function resolveContext(
  entityName: string | null,
  schema: SchemaIR
): ContextResolverOutput {
  if (!entityName) {
    return { entityId: null, scopedSchemaVersion: schema.schemaVersion };
  }

  // "posts" or "posts.author_id" → root table "posts".
  const [root] = entityName.split(".");
  if (!root) {
    return { entityId: null, scopedSchemaVersion: schema.schemaVersion };
  }

  const exists = schema.tables.some((t) => t.name === root);
  if (!exists) {
    return { entityId: null, scopedSchemaVersion: schema.schemaVersion };
  }

  return { entityId: root, scopedSchemaVersion: schema.schemaVersion };
}
