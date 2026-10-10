import type {
  CanonicalColumn,
  CanonicalEnum,
  CanonicalForeignKey,
  CanonicalTable,
  SchemaDialect,
} from "@enops/atlas-schema";

/**
 * Table identity in CanonicalSchema is {schema, name} — never just
 * name, since two schemas can both have a "users" table. Every graph
 * node/edge key in this module is this qualified string, produced by
 * tableKey(), so "public.users" and "billing.users" never collide.
 */
export function tableKey(schema: string, name: string): string {
  return `${schema}.${name}`;
}

export interface TableNode {
  columns: CanonicalColumn[];
  key: string; // tableKey(schema, name)
  name: string;
  schema: string;
  table: CanonicalTable;
}

export interface Edge {
  fk: CanonicalForeignKey;
  from: string; // tableKey of the FK-holding table
  to: string; // tableKey of the referenced table
}

export interface SchemaGraph {
  adjacency: Map<string, Edge[]>; // outgoing, keyed by tableKey
  databaseType?: string;
  dialect: SchemaDialect;
  enums: CanonicalEnum[];
  nodes: Map<string, TableNode>;
  reverseAdjacency: Map<string, Edge[]>; // incoming, keyed by tableKey
  version: 2 | null;
}

export interface DanglingEdgeError {
  edge: Edge;
  kind: "dangling-edge";
  missing: "from" | "to";
}
