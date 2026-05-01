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

export interface AISettings {
  claudeApiKey?: string;
  id?: string;
  openaiApiKey?: string;
  provider: "claude" | "gpt";
  updatedAt: Date;
}

export class AppDatabase extends Dexie {
  projects!: Table<Project>;
  aiSettings!: Table<AISettings>;

  constructor() {
    super("EnopsDevDB");

    this.version(1)
      .stores({
        projects: "id, name, createdAt, updatedAt", // 'id' is primary key, others are indexes
        aiSettings: "++id, updatedAt",
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
  }
}

export const db = new AppDatabase();
