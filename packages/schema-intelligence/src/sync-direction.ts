/** Three-way comparison prevents echo loops and never resolves conflicts by time. */
export function schemaSyncDirection(input: {
  atlasDigest: string | null;
  baselineDigest: string | null;
  forgeDigest: string;
}): "synchronized" | "to_atlas" | "to_forge" | "conflict" {
  if (input.atlasDigest === input.forgeDigest) return "synchronized";
  if (input.atlasDigest === null) return "to_atlas";
  if (!input.baselineDigest) return "conflict";
  if (input.atlasDigest === input.baselineDigest) return "to_atlas";
  if (input.forgeDigest === input.baselineDigest) return "to_forge";
  return "conflict";
}

export const SCHEMA_CHANGE_FORMATS = new Set([
  "dbml",
  "drizzle",
  "prisma",
  "postgres",
  "mysql",
]);

/** Edits existing sources rather than replacing them with a lossy generated model. */
export function schemaChangeTask(input: {
  atlasDbml: string;
  format: string;
  sourcePaths: string[];
}) {
  return [
    `Synchronize the Atlas schema into this repository's existing ${input.format} schema.`,
    `Edit the existing schema sources in place: ${input.sourcePaths.join(", ")}.`,
    "Preserve model/property/export names, @map/@@map, table mappings, relations, comments, and application-only attributes. Do not introduce a different ORM, ODM, or a second schema definition.",
    input.format === "postgres" || input.format === "mysql"
      ? "This repository uses plain SQL. Update its existing schema snapshot in the same SQL dialect; do not add an ORM."
      : "Keep using the repository's existing schema library and conventions.",
    "Add migration files using the repository's existing convention when it has one. Never connect to or migrate a real database.",
    "Make only schema-related changes. Leave the changes uncommitted in the workspace. Do not commit, push, or open a pull request.",
    "The result is verified by re-extracting the schema and must match this Atlas target exactly:",
    "```dbml",
    input.atlasDbml.trim(),
    "```",
  ].join("\n");
}

/** Paused work on a different saved version cannot mutate the current workspace.
 * Pending/running work still blocks because it can use the same live workspace.
 * Missing version evidence fails closed.
 */
export function blocksSchemaSync(
  run: { status: string; externalRef: unknown },
  versionId: string
) {
  const ref = run.externalRef as { forgeVersionId?: string } | null;
  return (
    run.status !== "paused" ||
    !ref?.forgeVersionId ||
    ref.forgeVersionId === versionId
  );
}
