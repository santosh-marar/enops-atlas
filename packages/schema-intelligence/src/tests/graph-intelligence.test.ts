import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyzeImpact,
  buildSchemaGraph,
  getNeighborhood,
  serializeNeighborhood,
  tableKey,
} from "@enops/atlas-graph";
import type { CanonicalSchema } from "@enops/atlas-schema";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { buildSchemaContext } from "../llm-agent/schema-context";

let schema: CanonicalSchema;

beforeAll(() => {
  const raw = readFileSync(
    join(
      import.meta.dirname,
      "../../../schema/src/canonical/__fixtures__/full.dbml"
    ),
    "utf-8"
  );
  const parsed = parseDbml(raw);
  ({ schema } = normalize(parsed));
});

describe("buildSchemaGraph — real CanonicalSchema from full.dbml", () => {
  it("creates one node per table, keyed schema-qualified", () => {
    const { graph } = buildSchemaGraph(schema);
    expect(graph.version).toBe(2);
    expect(graph.dialect).toBe("unknown");
    expect(graph.nodes.has("public.users")).toBe(true);
    expect(graph.nodes.has("public.orders")).toBe(true);
    expect(graph.nodes.has("public.user_profiles")).toBe(true);
  });

  it("wires edges from each table's own foreignKeys[], both directions written correctly", () => {
    const { graph } = buildSchemaGraph(schema);
    // orders -> users (many-side-first syntax in the DBML)
    expect(graph.adjacency.get("public.orders")).toHaveLength(1);
    expect(graph.adjacency.get("public.orders")![0]!.to).toBe("public.users");
    expect(
      graph.reverseAdjacency
        .get("public.users")!
        .map((e) => e.from)
        .sort()
    ).toEqual(["public.orders", "public.user_profiles"]);
  });

  it("reports zero dangling edges for a well-formed schema", () => {
    const { danglingEdges } = buildSchemaGraph(schema);
    expect(danglingEdges).toHaveLength(0);
  });
});

describe("getNeighborhood + serializeNeighborhood", () => {
  it("walks outward and includes onDelete in the serialized output when present", () => {
    const { graph } = buildSchemaGraph(schema);
    const { tables } = getNeighborhood(graph, ["public.orders"], { hops: 1 });
    expect(tables.has("public.users")).toBe(true);

    const text = serializeNeighborhood(graph, tables);
    expect(text).toContain("on delete cascade");
    expect(text).toContain("public.orders");
    expect(text).toContain("public.users");
  });

  it("surfaces column facts (default, autoIncrement) in the serialized output", () => {
    const { graph } = buildSchemaGraph(schema);
    const { tables } = getNeighborhood(graph, ["public.users"], { hops: 0 });
    const text = serializeNeighborhood(graph, tables);
    expect(text).toContain("auto"); // id [increment]
    expect(text).toContain("default(boolean:true)"); // is_active default
  });
});

describe("analyzeImpact — real schema", () => {
  it('remove-table "users" is breaking: both orders and user_profiles depend on it', () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      kind: "remove-table",
      schema: "public",
      table: "users",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.severity).toBe("breaking");
      expect(result.report.affectedTables.sort()).toEqual([
        "public.orders",
        "public.user_profiles",
      ]);
      // The cascade note should be present for the orders relationship specifically.
      expect(
        result.report.notes.some((n) => n.includes("ON DELETE CASCADE"))
      ).toBe(true);
    }
  });

  it("remove-column orders.user_id is breaking (it is the FK column)", () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      column: "user_id",
      kind: "remove-column",
      schema: "public",
      table: "orders",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.severity).toBe("breaking");
      expect(result.report.affectedTables).toEqual(["public.users"]);
    }
  });

  it("treats removal of an unreferenced column as destructive", () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      column: "bio",
      kind: "remove-column",
      schema: "public",
      table: "users",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.severity).toBe("breaking");
      expect(result.report.destructive).toBe(true);
    }
  });

  it("remove-enum order_status is breaking: used by both users.status and orders.status", () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      enumName: "order_status",
      kind: "remove-enum",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.severity).toBe("breaking");
      expect(result.report.affectedTables.sort()).toEqual([
        "public.orders",
        "public.users",
      ]);
    }
  });

  it("returns not-found for a nonexistent table", () => {
    const { graph } = buildSchemaGraph(schema);
    const result = analyzeImpact(schema, graph, {
      kind: "remove-table",
      schema: "public",
      table: "ghost",
    });
    expect(result.ok).toBe(false);
  });
});

describe("tableKey", () => {
  it("qualifies by schema, so same-named tables in different schemas never collide", () => {
    expect(tableKey("public", "users")).not.toBe(tableKey("billing", "users"));
  });
});

describe("canonical v2 graph context", () => {
  const richDbml = `
Project rich {
  database_type: "PostgreSQL"
}
Enum core.account_status {
  active
  disabled
}
Table core.accounts {
  id bigint [pk]
  email varchar(255) [unique, note: 'Login address']
  payload jsonb
  balance numeric(20,8) [default: 0.1000000000000000001]
  status core.account_status
  age int [check: \`age >= 0\`]
  indexes {
    (\`lower(email)\`) [name: "accounts_email_lower"]
  }
  checks {
    \`age < 150\` [name: "reasonable_age"]
  }
  Note: 'Customer accounts'
}
Table core.sessions {
  id bigint [pk]
  account_id bigint
}
Ref fk_sessions_account: core.sessions.account_id > core.accounts.id [delete: cascade, update: restrict]
`;

  it("serializes dialect, native types, exact defaults, enums, checks, indexes and FK actions", () => {
    const rich = normalize(parseDbml(richDbml)).schema;
    const result = buildSchemaContext(
      rich,
      ["core.accounts", "core.sessions"],
      { hops: 1 }
    );
    expect(result.context).toContain("canonical=v2 dialect=postgres");
    expect(result.context).toContain("enum core.account_status");
    expect(result.context).toContain("native(jsonb)");
    expect(result.context).toContain("default(number:0.1000000000000000001)");
    expect(result.context).toContain('index "accounts_email_lower"');
    expect(result.context).toContain('check "reasonable_age"');
    expect(result.context).toContain("on delete cascade");
    expect(result.context).toContain("on update restrict");
  });

  it("reports unique and expression-index impact for a removed column", () => {
    const rich = normalize(parseDbml(richDbml)).schema;
    const { graph } = buildSchemaGraph(rich);
    const result = analyzeImpact(rich, graph, {
      column: "email",
      kind: "remove-column",
      schema: "core",
      table: "accounts",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.severity).toBe("breaking");
    expect(result.report.affectedConstraints.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["unique", "index"])
    );
  });

  it("refuses legacy canonical objects at the LLM context boundary", () => {
    const rich = normalize(parseDbml(richDbml)).schema;
    const legacy: CanonicalSchema = { ...rich };
    delete legacy.version;
    expect(() => buildSchemaContext(legacy, ["core.accounts"])).toThrow(
      "canonical v2"
    );
  });
});
