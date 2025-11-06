import Dexie, { Table } from "dexie";
import { Node, Edge } from "@xyflow/react";

export interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: Node[];
  edges?: Edge[];
  createdAt: Date;
  updatedAt: Date;
}

export class AppDatabase extends Dexie {
  projects!: Table<Project>;

  constructor() {
    super("EnopsDevDB");
    this.version(1).stores({
      projects: "++id, name, createdAt, updatedAt",
    }).upgrade(tx => {
      return tx.table("projects").toCollection().modify(project => {
        if (!project.nodes) project.nodes = [];
        if (!project.edges) project.edges = [];
      });
    });
  }
}

export const db = new AppDatabase();
