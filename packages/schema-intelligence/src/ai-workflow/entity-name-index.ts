import type { SchemaIR } from "./types";

/**
 * Flattens SchemaIR into a compact list of resolvable entity names.
 * Tables: "posts"
 * Columns: "posts.author_id"  (qualified so same-named columns on different
 * tables — e.g. both `posts.id` and `users.id` — don't collide)
 *
 * This belongs conceptually in @enops/atlas-schema-ir (pure derivation of SchemaIR,
 * not refinement-pipeline logic) — kept here for now, move on extraction.
 */
export function getEntityNameIndex(schema: SchemaIR): string[] {
  const names: string[] = [];
  for (const table of schema.tables) {
    names.push(table.name);
    for (const column of table.columns) {
      names.push(`${table.name}.${column.name}`);
    }
  }
  return names;
}
