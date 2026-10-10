import { describe, expect, test } from "bun:test";
import type { SchemaModel } from "@enops/atlas-schema-intelligence/ai";
import { generateFromPlan, planRequest } from "../lib/ai/schema-flow";
import { analyzeDbml } from "../lib/atlas";

/** A model that answers from a list, so no network is used. */
const fakeModel = (answers: unknown[]) => {
  const calls: unknown[] = [];
  const model: SchemaModel = {
    generateObject: async (request) => {
      calls.push(request);
      if (answers.length === 0) throw new Error("model called too many times");
      return { object: answers.shift() as never };
    },
  };
  return { calls, model };
};

const PLAN_ANSWER = {
  confidence: 0.9,
  decisions: [],
  needsClarification: false,
  tables: [{ isNew: true, name: "users" }],
};

const GOOD_DBML =
  "Table users {\n  id uuid [pk]\n  email varchar [not null]\n}";

describe("planning", () => {
  test("a clear request gives a plan to approve, and nothing is generated", async () => {
    const { model, calls } = fakeModel([PLAN_ANSWER]);
    const step = await planRequest({
      dbml: "",
      message: "a users table",
      model,
    });
    expect(step.kind).toBe("plan");
    if (step.kind === "plan") {
      expect(step.plan.tables).toEqual([{ isNew: true, name: "users" }]);
    }
    expect(calls).toHaveLength(1);
  });

  test("an unclear request asks a question instead of guessing", async () => {
    const { model } = fakeModel([
      {
        clarifyingQuestion: "Which kind of users?",
        confidence: 0.3,
        needsClarification: true,
      },
    ]);
    const step = await planRequest({ dbml: "", message: "stuff", model });
    expect(step).toEqual({
      kind: "question",
      options: undefined,
      text: "Which kind of users?",
    });
  });
});

describe("generating from an approved plan", () => {
  const plan = {
    decisions: [],
    entityName: null,
    generationPrompt: "",
    id: "p1",
    operationType: "generate" as const,
    originalPrompt: "a users table",
    tables: [{ isNew: true, name: "users" }],
  };

  test("valid DBML is returned and parses", async () => {
    const { model } = fakeModel([{ dbml: GOOD_DBML }]);
    const proposal = await generateFromPlan({ dbml: "", model, plan });
    expect(proposal.valid).toBe(true);
    expect(proposal.problems).toEqual([]);
    expect(analyzeDbml(proposal.dbml).canonical.tables).toHaveLength(1);
  });

  test("a broken answer is retried, and a fixed one is accepted", async () => {
    const { model } = fakeModel([
      { dbml: "Table users {" },
      { dbml: GOOD_DBML },
    ]);
    const proposal = await generateFromPlan({ dbml: "", model, plan });
    expect(proposal.valid).toBe(true);
    expect(proposal.attempts).toBe(2);
  });

  test("DBML that never parses is reported as invalid", async () => {
    const { model } = fakeModel([
      { dbml: "Table users {" },
      { dbml: "Table users {" },
      { dbml: "Table users {" },
      { dbml: "Table users {" },
    ]);
    const proposal = await generateFromPlan({ dbml: "", model, plan });
    expect(proposal.valid).toBe(false);
    expect(proposal.problems.length).toBeGreaterThan(0);
  });
});
