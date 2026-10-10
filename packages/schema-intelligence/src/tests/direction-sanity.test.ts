import { describe, expect, it } from "bun:test";
import type {
  ColumnSchema,
  NormalizedSchema,
  RelationshipSchema,
  TableSchema,
} from "@enops/atlas-schema";
import { checkDirectionSanity } from "../validator/direction-sanity";

// Fixtures — real dbml/types.ts shapes
function makeColumn(
  name: string,
  overrides: Partial<ColumnSchema> = {}
): ColumnSchema {
  return {
    checks: [],
    default: null,
    enumRef: null,
    increment: false,
    name,
    note: null,
    nullable: false,
    primaryKey: false,
    type: "uuid",
    typeArgs: null,
    unique: false,
    ...overrides,
  };
}

function makeTable(name: string, columns: ColumnSchema[]): TableSchema {
  return {
    checks: [],
    columns,
    fullName: `public.${name}`,
    indexes: [],
    name,
    note: null,
    records: null,
    schema: "public",
  };
}

function makeRel(
  fromTable: string,
  fromCol: string,
  toTable: string,
  toCol = "id",
  cardinality: RelationshipSchema["cardinality"] = "one-to-many"
): RelationshipSchema {
  return {
    cardinality,
    from: { columns: [fromCol], schema: "public", table: fromTable },
    onDelete: "none",
    onUpdate: "none",
    to: { columns: [toCol], schema: "public", table: toTable },
  };
}

function makeSchema(
  tables: TableSchema[],
  relationships: RelationshipSchema[]
): NormalizedSchema {
  const tableMap = new Map(tables.map((t) => [t.fullName, t]));
  return { enums: new Map(), raw: "", relationships, tables: tableMap };
}

// Tests
describe("checkDirectionSanity", () => {
  it("returns no flags for a clean, correctly-named relationship", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_id"),
    ]);
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "user_id", "users")]
    );

    const result = checkDirectionSanity(schema);

    expect(result.totalRelationships).toBe(1);
    expect(result.flags).toHaveLength(0);
    expect(result.flagRate).toBe(0);
  });

  it("flags an FK column pointing at a non-PK, non-unique column (likely reversed)", () => {
    const users = makeTable("users", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("bio"),
    ]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_id"),
    ]);
    // Points at users.bio instead of users.id — bio is neither PK nor unique.
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "user_id", "users", "bio")]
    );

    const result = checkDirectionSanity(schema);

    const flag = result.flags.find(
      (f) => f.reason === "target_not_pk_or_unique"
    );
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("high");
  });

  it("does not flag a target that is unique but not primaryKey", () => {
    const users = makeTable("users", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("email", { unique: true }),
    ]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_email"),
    ]);
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "user_email", "users", "email")]
    );

    const result = checkDirectionSanity(schema);
    expect(
      result.flags.find((f) => f.reason === "target_not_pk_or_unique")
    ).toBeUndefined();
  });

  it("flags an FK column whose name doesn't match the referenced table (high severity, not _id shaped)", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("owner"),
    ]); // not FK-shaped at all
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "owner", "users")]
    );

    const result = checkDirectionSanity(schema);

    const flag = result.flags.find((f) => f.reason === "fk_name_mismatch");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("high");
  });

  it("flags role-based FK naming at medium severity (still _id shaped)", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("author_id"),
    ]);
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "author_id", "users")]
    );

    const result = checkDirectionSanity(schema);

    const flag = result.flags.find((f) => f.reason === "fk_name_mismatch");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("medium"); // legitimate pattern, lower confidence it's wrong
  });

  it("does not flag naming when the FK column matches convention exactly", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_id"),
    ]);
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "user_id", "users")]
    );

    const result = checkDirectionSanity(schema);
    expect(
      result.flags.find((f) => f.reason === "fk_name_mismatch")
    ).toBeUndefined();
  });

  it("skips naming check for composite FKs (multi-column)", () => {
    const users = makeTable("users", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("tenant_id", { primaryKey: true }),
    ]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("weird_col_a"),
      makeColumn("weird_col_b"),
    ]);
    const rel: RelationshipSchema = {
      cardinality: "one-to-many",
      from: {
        columns: ["weird_col_a", "weird_col_b"],
        schema: "public",
        table: "posts",
      },
      onDelete: "none",
      onUpdate: "none",
      to: { columns: ["id", "tenant_id"], schema: "public", table: "users" },
    };
    const schema = makeSchema([users, posts], [rel]);

    const result = checkDirectionSanity(schema);
    expect(
      result.flags.find((f) => f.reason === "fk_name_mismatch")
    ).toBeUndefined();
    expect(
      result.flags.find((f) => f.reason === "target_not_pk_or_unique")
    ).toBeUndefined();
  });

  it("does not crash when the referenced table doesn't exist (validate()'s job, not ours)", () => {
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_id"),
    ]);
    const schema = makeSchema([posts], [makeRel("posts", "user_id", "users")]); // users table missing

    expect(() => checkDirectionSanity(schema)).not.toThrow();
    const result = checkDirectionSanity(schema);
    expect(
      result.flags.find((f) => f.reason === "target_not_pk_or_unique")
    ).toBeUndefined();
  });

  it("flags self-referential role-based naming at medium severity (manager_id, not employee_id)", () => {
    // Self-referential FKs almost always use role-based names (manager_id,
    // parent_id, approved_by_id) rather than the naive singular+_id
    // convention (employee_id). This SHOULD flag at medium severity — same
    // as "author_id" referencing "users" — not zero flags. A checker that
    // stayed silent here would also stay silent on a genuinely reversed
    // self-referential FK, since the naming shape looks identical either way.
    const employees = makeTable("employees", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("manager_id"),
    ]);
    const schema = makeSchema(
      [employees],
      [makeRel("employees", "manager_id", "employees")]
    );

    const result = checkDirectionSanity(schema);

    const flag = result.flags.find((f) => f.reason === "fk_name_mismatch");
    expect(flag).toBeDefined();
    expect(flag!.severity).toBe("medium");
    // Target check should still pass — manager_id correctly points at employees.id (the PK).
    expect(
      result.flags.find((f) => f.reason === "target_not_pk_or_unique")
    ).toBeUndefined();
  });

  it("does not flag self-referential FK when named to match convention exactly", () => {
    // If someone names it "employee_id" instead of "manager_id", it matches
    // the naive convention and should be silent.
    const employees = makeTable("employees", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("employee_id"),
    ]);
    const schema = makeSchema(
      [employees],
      [makeRel("employees", "employee_id", "employees")]
    );

    const result = checkDirectionSanity(schema);
    expect(result.flags).toHaveLength(0);
  });

  it("computes flagRate correctly across multiple relationships", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const posts = makeTable("posts", [
      makeColumn("id", { primaryKey: true }),
      makeColumn("user_id"),
      makeColumn("owner"),
    ]);
    const schema = makeSchema(
      [users, posts],
      [makeRel("posts", "user_id", "users"), makeRel("posts", "owner", "users")] // one clean, one bad naming
    );

    const result = checkDirectionSanity(schema);
    expect(result.totalRelationships).toBe(2);
    expect(result.flags.length).toBeGreaterThan(0);
    expect(result.flagRate).toBeGreaterThan(0);
    expect(result.flagRate).toBeLessThanOrEqual(1);
  });

  it("returns flagRate 0 for a schema with no relationships", () => {
    const users = makeTable("users", [makeColumn("id", { primaryKey: true })]);
    const schema = makeSchema([users], []);

    const result = checkDirectionSanity(schema);
    expect(result.totalRelationships).toBe(0);
    expect(result.flagRate).toBe(0);
  });
});
