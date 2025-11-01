import { Node, Edge } from "@xyflow/react";

export interface Column {
  name: string;
  type: string;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  position?: { x: number; y: number };
}

export interface SchemaState {
  dbml: string;
  sql: string;
  tables: Table[];
  nodes: Node[];
  edges: Edge[];

  updateFromDBML: (dbml: string) => void;
  updateFromXYFlow: (nodes: Node[], edges: Edge[]) => void;
  updateFromSQL: (sql: string) => void;
}
