import { parseDbml } from "@enops/atlas-schema";
import { schemaSnapshot } from "./schema-snapshot";

/** Validate while preserving the user's original DBML and annotations. */
export function normalizeDirectDbml(dbml: string): string {
  parseDbml(dbml);
  return `${dbml.trim()}\n`;
}

export function directDbmlDigest(dbml: string): string {
  return schemaSnapshot(dbml).digest;
}
