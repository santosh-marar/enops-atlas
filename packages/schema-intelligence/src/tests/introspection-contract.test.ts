import { describe, expect, test } from "bun:test";
import {
  parseDbml,
  renderDbml,
  validateCanonicalStructure,
} from "@enops/atlas-schema";
import {
  type IntrospectedColumn,
  introspectedToCanonical,
} from "../introspection/ir";

const column = (
  name: string,
  extra: Partial<IntrospectedColumn> = {}
): IntrospectedColumn => ({
  autoIncrement: false,
  default: null,
  name,
  nativeType: "integer",
  nullable: false,
  primaryKey: false,
  unique: false,
  ...extra,
});
describe("introspection canonical contract", () => {
  test("retains v2, namespaced enums, ordered keys and cross-schema references", () => {
    const schema = introspectedToCanonical({
      dialect: "postgres",
      tables: [
        {
          checks: [{ column: null, expression: "a >= 0", name: "positive" }],
          columns: [column("a"), column("b")],
          foreignKeys: [],
          indexes: [
            { columns: ["a"], name: "parent_a", type: "hash", unique: false },
          ],
          name: "parent",
          primaryKey: { columns: ["b", "a"], name: "parent_pk" },
          schema: "auth",
        },
        {
          columns: [
            column("id", { autoIncrement: true, primaryKey: true }),
            column("a"),
            column("b"),
            column("state", {
              default: "'pending'::auth.state",
              enumName: "state",
              enumSchema: "auth",
              enumValues: ["pending", "paid"],
              nativeType: "auth.state",
            }),
          ],
          foreignKeys: [
            {
              columns: ["b", "a"],
              name: "cross_fk",
              onDelete: "CASCADE",
              onUpdate: "RESTRICT",
              refColumns: ["b", "a"],
              refSchema: "auth",
              refTable: "parent",
            },
          ],
          indexes: [],
          name: "child",
          schema: "app",
        },
      ],
    });
    expect(schema.version).toBe(2);
    expect(validateCanonicalStructure(schema)).toEqual([]);
    expect(schema.enums).toMatchObject([
      { name: "state", schema: "auth", values: ["pending", "paid"] },
    ]);
    expect(
      schema.tables.find((t) => t.name === "parent")?.primaryKey?.columns
    ).toEqual(["b", "a"]);
    const child = schema.tables.find((t) => t.name === "child")!;
    expect(child.foreignKeys[0]?.refTable).toEqual({
      schema: "auth",
      table: "parent",
    });
    expect(child.foreignKeys[0]?.name).toBe("cross_fk");
    expect(parseDbml(renderDbml(schema)).tables.size).toBe(2);
  });
  test("binary data remains an unsupported native type instead of becoming text", () => {
    const schema = introspectedToCanonical({
      dialect: "postgres",
      tables: [
        {
          columns: [
            column("id", { primaryKey: true }),
            column("payload", { nativeType: "bytea" }),
          ],
          foreignKeys: [],
          indexes: [],
          name: "docs",
          schema: "public",
        },
      ],
    });
    expect(schema.tables[0]?.columns[1]).toMatchObject({
      nativeType: { name: "bytea" },
      type: "unsupported",
    });
  });
  test("rejects conflicting enum identities", () => {
    expect(() =>
      introspectedToCanonical({
        dialect: "postgres",
        tables: [
          {
            columns: [
              column("a", { enumName: "state", enumValues: ["a"] }),
              column("b", { enumName: "state", enumValues: ["b"] }),
            ],
            foreignKeys: [],
            indexes: [],
            name: "docs",
            schema: "public",
          },
        ],
      })
    ).toThrow("Conflicting");
  });
});
