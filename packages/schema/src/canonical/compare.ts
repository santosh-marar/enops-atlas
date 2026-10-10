import { sha256Hex } from "../hash";
import type { CanonicalSchema } from "./types";

/** Locale-independent canonical JSON. Set-like lists are sorted explicitly;
 * ordered index/FK columns, enum values, expressions and literals are not.
 */
export function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableValue(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function sortedSet<T>(values: readonly T[]): T[] {
  return [...values].sort((a, b) => {
    const x = stableValue(a),
      y = stableValue(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
export function canonicalProjection(schema: CanonicalSchema) {
  return {
    ...schema,
    enums: sortedSet(schema.enums),
    tables: sortedSet(
      schema.tables.map((t) => ({
        ...t,
        checks: sortedSet(t.checks ?? []),
        columns: sortedSet(
          t.columns.map((c) => ({ ...c, checks: sortedSet(c.checks ?? []) }))
        ),
        foreignKeys: sortedSet(t.foreignKeys),
        indexes: sortedSet(t.indexes),
        uniqueConstraints: sortedSet(t.uniqueConstraints),
      }))
    ),
  };
}
export function canonicalDigest(schema: CanonicalSchema): string {
  return sha256Hex(stableValue(canonicalProjection(schema)));
}
