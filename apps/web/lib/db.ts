import Dexie, { Table } from "dexie";
import { Node, Edge } from "@xyflow/react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ProjectTechStack {
  database: string;
  orm: string;
  language: string;
  backendFramework: string;
  authLibrary: string;
  billingLibrary: string;
}

export interface Project {
  id?: number;
  name: string;
  dbml: string;
  nodes?: Node[];
  edges?: Edge[];
  aiChatHistory?: ChatMessage[];
  techStack?: ProjectTechStack;
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

export class AppDatabase extends Dexie {
  projects!: Table<Project>;
  aiSettings!: Table<AISettings>;

  constructor() {
    super("EnopsDevDB");

    // Version 1: Initial schema with complete project isolation
    // Each project has: name, dbml, nodes, edges, aiChatHistory, techStack
    this.version(1).stores({
      projects: "++id, name, createdAt, updatedAt",
      aiSettings: "++id, updatedAt",
    }).upgrade(tx => {
      return tx.table("projects").toCollection().modify(project => {
        if (!project.nodes) project.nodes = [];
        if (!project.edges) project.edges = [];
        if (!project.aiChatHistory) project.aiChatHistory = [];
        if (!project.techStack) project.techStack = null;
      });
    });
  }
}

export const db = new AppDatabase();
