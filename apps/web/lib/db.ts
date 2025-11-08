import Dexie, { Table } from "dexie";
import { Node, Edge } from "@xyflow/react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: Node[];
  edges?: Edge[];
  aiChatHistory?: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AISettings {
  id?: number;
  provider: "claude" | "gpt";
  claudeApiKey?: string;
  openaiApiKey?: string;
  updatedAt: Date;
}

export interface TechStack {
  id?: number;
  database: string;
  orm: string;
  language: string;
  backendFramework: string;
  authLibrary: string;
  billingLibrary: string;
  description: string;
  updatedAt: Date;
}

export class AppDatabase extends Dexie {
  projects!: Table<Project>;
  aiSettings!: Table<AISettings>;
  techStack!: Table<TechStack>;

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

    // Add AI settings table
    this.version(2).stores({
      projects: "++id, name, createdAt, updatedAt",
      aiSettings: "++id, updatedAt",
    });

    // Add tech stack table
    this.version(3).stores({
      projects: "++id, name, createdAt, updatedAt",
      aiSettings: "++id, updatedAt",
      techStack: "++id, updatedAt",
    });
  }
}

export const db = new AppDatabase();
