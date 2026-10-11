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
): Promise<{ number: number | null; saved: boolean }> {
  const [latest] = await listVersions(projectId);
  if (isSameAsLast(latest?.digest, dbml)) {
    return { number: latest?.number ?? null, saved: false };
  }

  const number = (latest?.number ?? 0) + 1;
  await db.versions.add({
    ...snapshotOf(dbml),
    createdAt: new Date(),
    dbml,
    id: nanoId(),
    label: label?.trim() || undefined,
    number,
    projectId,
  });
  return { number, saved: true };
}

const MAX_LABEL = 80;

/**
 * Saves the schema as a version just before an AI change is applied, so it can
 * be restored. If the schema is already the latest version, that one is the
 * checkpoint and nothing new is saved.
 */
export async function createCheckpoint(
  projectId: string,
  dbml: string,
  request: string
): Promise<{ number: number | null }> {
  const text = request.replace(/\s+/g, " ").trim();
  const reason =
    text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL)}...` : text;
  const { number } = await saveVersion(
    projectId,
    dbml,
    `Checkpoint before AI: ${reason}`
  );
  return { number };
}
