import { db, type SchemaVersion } from "./db";
import { nanoId } from "./id";
import { isSameAsLast, snapshotOf } from "./schema-history";

/** Versions of a project, newest first, each with its number (v1, v2, ...). */
export async function listVersions(
  projectId: string
): Promise<(SchemaVersion & { number: number })[]> {
  const oldestFirst = await db.versions
    .where("projectId")
    .equals(projectId)
    .sortBy("createdAt");
  // Versions saved before numbering get theirs from their position.
  return oldestFirst
    .map((version, index) => ({
      ...version,
      number: version.number ?? index + 1,
    }))
    .reverse();
}

/** Saves the current DBML as a version, unless it is the same schema as the last one. */
export async function saveVersion(
  projectId: string,
  dbml: string,
  label?: string
): Promise<{ saved: boolean }> {
  const [latest] = await listVersions(projectId);
  if (isSameAsLast(latest?.digest, dbml)) return { saved: false };

  await db.versions.add({
    ...snapshotOf(dbml),
    createdAt: new Date(),
    dbml,
    id: nanoId(),
    label: label?.trim() || undefined,
    number: (latest?.number ?? 0) + 1,
    projectId,
  });
  return { saved: true };
}
