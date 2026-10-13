import { describe, expect, test } from "bun:test";
import {
  assessDatabaseCapabilities,
  type IntrospectedDatabase,
  introspectedToCanonical,
  mapNativeType,
} from "../introspection/ir";

const database: IntrospectedDatabase = {
  dialect: "postgres",
  tables: [
    {
      columns: [
        {
          autoIncrement: true,
          default: null,
          name: "id",
          nativeType: "bigint",
          nullable: false,
          primaryKey: true,
          unique: true,
        },
        {
          autoIncrement: false,
          default: null,
          enumValues: ["pending", "paid"],
          name: "status",
          nativeType: "enum",
          nullable: false,
          primaryKey: false,
          unique: false,
        },
        {
          autoIncrement: false,
          default: null,
          name: "payload",
          nativeType: "geometry",
          nullable: true,
          primaryKey: false,
          unique: false,
        },
      ],
      foreignKeys: [],
      indexes: [],
      name: "orders",
      schema: "public",
    },
    {
      columns: [
        {
          autoIncrement: true,
          default: null,
          name: "id",
          nativeType: "bigint",
          nullable: false,
          primaryKey: true,
          unique: true,
        },
        ...["customerId", "email", "tenantId"].map((name) => ({
          autoIncrement: false,
          default: null,
          name,
          nativeType: name === "email" ? "text" : "bigint",
          nullable: false,
          primaryKey: false,
          unique: false,
        })),
      ],
      foreignKeys: [
        {
          columns: ["customerId"],
          onDelete: "CASCADE",
          onUpdate: "NO ACTION",
          refColumns: ["id"],
          refTable: "customers",
        },
      ],
      indexes: [
        {
          columns: ["email", "tenantId"],
          name: "uniq_email_tenant",
          unique: true,
        },
      ],
      name: "customers",
      schema: "public",
    },
  ],
};

describe("introspection IR", () => {
  test("maps native types onto the canonical system", () => {
    expect(mapNativeType("varchar(255)")).toEqual({
      length: 255,
      type: "string",
    });
    expect(mapNativeType("numeric(10,2)")).toEqual({
      precision: [10, 2],
      type: "decimal",
    });
    expect(mapNativeType("timestamp with time zone")).toEqual({
      type: "timestamp",
    });
    expect(mapNativeType("tinyint(1)")).toEqual({ type: "boolean" });
    expect(mapNativeType("enum('a','b')")).toEqual({ type: "enum" });
    expect(mapNativeType("geometry")).toEqual({ type: "unsupported" });
  });

  test("maps arrays as their element type, keeping the dimensions", () => {
    expect(mapNativeType("text[]")).toEqual({
      arrayDimensions: 1,
      type: "text",
    });
    expect(mapNativeType("character varying(40)[]")).toEqual({
      arrayDimensions: 1,
      length: 40,
      type: "string",
    });
    expect(mapNativeType("integer[][]")).toEqual({
      arrayDimensions: 2,
      type: "int",
    });
    // An enum array is not guessed.
    expect(mapNativeType("mood[]")).toEqual({ type: "unsupported" });
  });

  test("builds a canonical schema with keys and foreign keys", () => {
    const canonical = introspectedToCanonical(database);
    expect(canonical.dialect).toBe("postgres");
    const customers = canonical.tables.find((t) => t.name === "customers");
    expect(customers?.primaryKey?.columns).toEqual(["id"]);
    expect(customers?.uniqueConstraints[0]).toMatchObject({
      columns: ["email", "tenantId"],
      name: "uniq_email_tenant",
    });
    const orders = canonical.tables.find((t) => t.name === "orders");
    expect(orders?.columns.find((c) => c.name === "id")?.autoIncrement).toBe(
      true
    );
    expect(orders?.columns.find((c) => c.name === "status")).toMatchObject({
      enumName: "enum",
      type: "enum",
    });
  });

  test("reports unsupported types as a capability matrix", () => {
    const report = assessDatabaseCapabilities(database);
    expect(report).toMatchObject({
      columns: 7,
      dialect: "postgres",
      enumColumns: 1,
      tables: 2,
    });
    expect(report.unsupported).toEqual([
      { column: "payload", table: "orders", type: "geometry" },
    ]);
  });
});
