import assert from "node:assert/strict";
import { generateFromCanonical } from "@enops/atlas-generators";
import { buildSchemaGraph } from "@enops/atlas-graph";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { validate } from "@enops/atlas-schema-intelligence";
import { generateDbmlPipeline } from "@enops/atlas-schema-intelligence/ai";
import { introspectedToCanonical } from "@enops/atlas-schema-intelligence/introspection";
import {
  drizzleToDbml,
  prismaToDbml,
} from "@enops/atlas-schema-intelligence/node";

const DBML = [
  "Table users {",
  "  id int [pk]",
  "  email varchar [unique]",
  "}",
  "",
  "Table posts {",
  "  id int [pk]",
  "  user_id int [ref: > users.id]",
  "}",
].join("\n");

const parsed = parseDbml(DBML);
const { schema } = normalize(parsed);
assert.equal(schema.tables.length, 2, "canonical schema has two tables");

const { graph } = buildSchemaGraph(schema);
assert.ok(graph, "schema graph builds");

const sql = generateFromCanonical(schema, { format: "sql" });
assert.equal(sql.ok, true, "sql generation succeeds");
assert.match(sql.code, /users/, "generated SQL mentions users");

assert.equal(typeof validate, "function", "root entry exports the validator");
assert.equal(
  typeof generateDbmlPipeline,
  "function",
  "ai entry exports the pipeline"
);
assert.equal(
  typeof introspectedToCanonical,
  "function",
  "introspection entry loads"
);
assert.equal(typeof prismaToDbml, "function", "node entry exports adapters");

// Reading Drizzle needs `typescript`. This project does not install it, so the
// package must still load and must explain what to install.
assert.throws(
  () => drizzleToDbml([{ content: "export {}", path: "schema.ts" }]),
  /typescript/,
  "drizzle reader explains the missing typescript package"
);

console.log("Artifact smoke passed: all package entries import and work");
