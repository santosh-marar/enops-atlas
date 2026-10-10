import { db, type SchemaVersion } from "./db";
import { nanoId } from "./id";
import { isSameAsLast, snapshotOf } from "./schema-history";

export async function listVersions(
  projectId: string
): Promise<SchemaVersion[]> {
  return await db.versions
    .where("projectId")
    .equals(projectId)
    .reverse()
    .sortBy("createdAt");
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
    label,
    projectId,
  });
  return { saved: true };
}
