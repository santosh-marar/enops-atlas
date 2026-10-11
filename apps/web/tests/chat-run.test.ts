import { describe, expect, test } from "bun:test";
import type { SchemaModel } from "@enops/atlas-schema-intelligence/ai";
import { isStopped, runGenerate, runPlan } from "../lib/ai/chat-run";

const DBML = "Table users {\n  id uuid [pk]\n  email varchar\n}";
const GOOD = "Table users {\n  id uuid [pk]\n  email varchar [not null]\n}";

const fakeModel = (answers: unknown[], delayMs = 0) => {
  const model: SchemaModel = {
    generateObject: async () => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (answers.length === 0) throw new Error("model called too many times");
      return { object: answers.shift() as never };
    },
  };
  return model;
};

const PLAN = {
  decisions: [],
  entityName: null,
  generationPrompt: "",
  id: "p1",
  operationType: "modify" as const,
  originalPrompt: "x",
  tables: [{ isNew: false, name: "users" }],
};

describe("planning", () => {
  test("reports each step as it starts", async () => {
    const steps: string[] = [];
    await runPlan({
      dbml: DBML,
      message: "add a phone column to users",
      model: fakeModel([
        { intentConfidence: 0.95, intentType: "add" },
        {
          entityConfidence: 0.9,
          entityName: "users",
          entityType: "table",
          isNewEntity: false,
          status: "resolved",
        },
        {
          confidence: 0.9,
          decisions: [],
          needsClarification: false,
          tables: [{ isNew: false, name: "users" }],
        },
      ]),
      onProgress: (step) => steps.push(step),
      rounds: [],
      signal: new AbortController().signal,
      techStack: null,
    });
    expect(steps).toEqual([
      "Understanding your request",
      "Finding the table or column you mean",
      "Reading the tables around it",
      "Writing the plan",
    ]);
  });

  test("stopping before the model answers throws and asks nothing more", async () => {
    const controller = new AbortController();
    const pending = runPlan({
      dbml: DBML,
      message: "add a phone column",
      model: fakeModel([{ intentConfidence: 1, intentType: "add" }], 50),
      onProgress: () => undefined,
      rounds: [],
      signal: controller.signal,
      techStack: null,
    });
    controller.abort();
    const error = await pending.catch((e: unknown) => e);
    expect(isStopped(error)).toBe(true);
  });

  test("an already-stopped request never reaches the model", async () => {
    const controller = new AbortController();
    controller.abort();
    let asked = 0;
    const model: SchemaModel = {
      generateObject: () => {
        asked += 1;
        throw new Error("should not be called");
      },
    };
    const error = await runPlan({
      dbml: DBML,
      message: "add a phone column",
      model,
      onProgress: () => undefined,
      rounds: [],
      signal: controller.signal,
      techStack: null,
    }).catch((e: unknown) => e);
    expect(isStopped(error)).toBe(true);
    expect(asked).toBe(0);
  });
});

describe("generating", () => {
  test("a retry after a broken answer is reported as a step", async () => {
    const steps: string[] = [];
    const proposal = await runGenerate({
      dbml: DBML,
      model: fakeModel([{ dbml: "Table users {" }, { dbml: GOOD }]),
      onProgress: (step) => steps.push(step),
      plan: PLAN,
      retrievedContext: "",
      signal: new AbortController().signal,
    });
    expect(proposal.valid).toBe(true);
    expect(proposal.attempts).toBe(2);
    expect(steps).toEqual([
      "Writing the schema",
      "Fixing problems it found (attempt 2)",
    ]);
  });

  test("stopping while writing discards the result", async () => {
    const controller = new AbortController();
    const pending = runGenerate({
      dbml: DBML,
      model: fakeModel([{ dbml: GOOD }], 50),
      onProgress: () => undefined,
      plan: PLAN,
      retrievedContext: "",
      signal: controller.signal,
    });
    controller.abort();
    expect(isStopped(await pending.catch((e: unknown) => e))).toBe(true);
  });
});
