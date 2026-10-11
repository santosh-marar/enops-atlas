import { describe, expect, test } from "bun:test";
import {
  schemaChanges,
  schemaSnapshot,
  schemaSynchronizationLosses,
} from "../schema-snapshot";

describe("schema synchronization losses", () => {
  test("PostgreSQL scalar arrays are kept exactly, so they are not a loss", () => {
    const snapshot = schemaSnapshot(
      'Table event {\n id integer [pk]\n tags "text[]" [not null]\n}'
    );
    expect(snapshot.losses[0]?.code).toBe("UNSUPPORTED_TYPE");
    expect(schemaSynchronizationLosses(snapshot)).toEqual([]);
  });

  test("unknown native and array types still fail closed", () => {
    for (const type of ["geometry", "geometry[]"]) {
      const snapshot = schemaSnapshot(
        `Table t {\n id integer [pk]\n value ${type}\n}`
      );
      expect(schemaSynchronizationLosses(snapshot)).toHaveLength(1);
    }
  });
});

describe("field-level schema changes", () => {
  const base = "Table users {\n id integer [pk]\n}";

  test("a nullable added field needs no review", () => {
    const { changes } = schemaChanges(
      base,
      "Table users {\n id integer [pk]\n email text\n}"
    );
    expect(changes).toEqual([
      {
        change: "added",
        object: "field public.users email",
        reviewRequired: false,
      },
    ]);
  });

  test("a required field without a default is flagged", () => {
    const { changes } = schemaChanges(
      base,
      "Table users {\n id integer [pk]\n email text [not null]\n}"
    );
    expect(changes.filter((change) => change.reviewRequired)).toEqual([
      {
        change: "added",
        object: "required field public.users.email without a default",
        reviewRequired: true,
      },
    ]);
  });

  test("removed tables and changed constraints need review", () => {
    const two = `${base}\nTable posts {\n id integer [pk]\n}`;
    expect(schemaChanges(two, base).changes).toContainEqual({
      change: "removed",
      object: "table public.posts",
      reviewRequired: true,
    });
    const indexed =
      "Table users {\n id integer [pk]\n indexes {\n  id [name: 'by_id']\n }\n}";
    expect(schemaChanges(base, indexed).changes).toContainEqual({
      change: "modified",
      object: "constraints/metadata public.users",
      reviewRequired: true,
    });
  });
});
