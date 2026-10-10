import type { Edge, Node } from "@xyflow/react";
import Dexie, { type Table } from "dexie";

export interface ChatMessage {
  content: string;
  id: string;
  role: "user" | "assistant";
}

export interface ProjectTechStack {
  authLibrary: string;
  backendFramework: string;
  billingLibrary: string;
  database: string;
  language: string;
  orm: string;
}

export interface Project {
  aiChatHistory?: ChatMessage[];
  createdAt: Date;
  dbml: string;
  edges?: Edge[];
  id: string;
  name: string;
  nodes?: Node[];
  techStack?: ProjectTechStack;
  updatedAt: Date;
}

/** A saved point in a project's history. DBML is the source; the digest decides "same as last". */
export interface SchemaVersion {
  createdAt: Date;
  dbml: string;
  digest: string;
  id: string;
  label?: string;
  /** Sequential per project (v1, v2, ...). Missing on versions saved before numbering. */
  number?: number;
  projectId: string;
  snapshotVersion: number;
}

export interface AISettings {
  id?: string;
  updatedAt: Date;
  vercelAIKey: string;
}

export class AppDatabase extends Dexie {
  projects!: Table<Project>;
  aiSettings!: Table<AISettings>;
  versions!: Table<SchemaVersion>;

  constructor() {
    super("EnopsDevDB");

    this.version(1)
      .stores({
        aiSettings: "++id, updatedAt",
        projects: "id, name, createdAt, updatedAt", // 'id' is primary key, others are indexes
      })
      .upgrade((tx) =>
        tx
          .table("projects")
          .toCollection()
          .modify((project) => {
            if (!project.nodes) {
              project.nodes = [];
            }
            if (!project.edges) {
              project.edges = [];
            }
            if (!project.aiChatHistory) {
              project.aiChatHistory = [];
            }
            if (!project.techStack) {
              project.techStack = null;
            }
          })
      );

    // Version 2 only adds the history table; projects and settings are untouched.
    this.version(2).stores({
      aiSettings: "++id, updatedAt",
      projects: "id, name, createdAt, updatedAt",
      versions: "id, projectId, createdAt",
    });
  }
}

export const db = new AppDatabase();
