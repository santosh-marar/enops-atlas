import type { Edge, Node } from "@xyflow/react";

export interface Column {
  name: string;
  nullable?: boolean;
  primaryKey?: boolean;
  type: string;
  unique?: boolean;
}

export interface Table {
  columns: Column[];
  id: string;
  name: string;
  position?: { x: number; y: number };
}

export interface SchemaState {
  dbml: string;
  edges: Edge[];
  nodes: Node[];
  sql: string;
  tables: Table[];

  updateFromDBML: (dbml: string) => void;
  updateFromSQL: (sql: string) => void;
  updateFromXYFlow: (nodes: Node[], edges: Edge[]) => void;
}
