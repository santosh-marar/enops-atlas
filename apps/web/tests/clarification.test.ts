import { describe, expect, test } from "bun:test";
import type { SchemaModel } from "@enops/atlas-schema-intelligence/ai";
import { planEdit, shouldStopAsking } from "../lib/ai/edit-workflow";

const DBML = `
Table users {
  id uuid [pk]
}
Table todos {
  id uuid [pk]
  user_id uuid [ref: > users.id]
}
`;

/** Answers from a list in order, and keeps every request so tests can read what was sent. */
const fakeModel = (answers: unknown[]) => {
  const requests: { prompt: string; system: string }[] = [];
  const model: SchemaModel = {
    generateObject: async (request) => {
      requests.push({
        prompt: request.prompt ?? "",
        system: request.system,
      });
      if (answers.length === 0) throw new Error("model called too many times");
      return { object: answers.shift() as never };
    },
  };
  return { model, requests };
};

const INTENT = { intentConfidence: 0.9, intentType: "add" };
const NO_ENTITY = {
  entityConfidence: 0,
  entityName: null,
  entityType: null,
  isNewEntity: false,
  status: "not_applicable",
};
const TABLES = [
  { isNew: true, name: "notifications" },
  { isNew: false, name: "todos" },
];
const ROUND_1 = {
  answer: "Triggered by todo events",
  question: "What triggers a notification?",
};
const ROUND_2 = { answer: "in-app and email", question: "Which channels?" };

describe("answers are remembered", () => {
  test("every step sees the original request and all earlier answers", async () => {
    const { model, requests } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        confidence: 0.9,
        decisions: [],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    await planEdit({
      dbml: DBML,
      history: [ROUND_1, ROUND_2],
      message: "add notification system",
      model,
    });
    // intent, entity and plan: three requests, each carrying the whole conversation
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      const sent = `${request.prompt}\n${request.system}`;
      expect(sent).toContain("add notification system");
      expect(sent).toContain("Triggered by todo events");
      expect(sent).toContain("in-app and email");
    }
  });

  test("the plan carries the answers into the schema writer's prompt", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        confidence: 0.9,
        decisions: [],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      history: [ROUND_1],
      message: "add notification system",
      model,
    });
    expect(step.kind).toBe("plan");
    if (step.kind === "plan") {
      expect(step.plan.generationPrompt).toContain("Triggered by todo events");
    }
  });

  test("an answered 'which table' question is not asked again", async () => {
    // The first answer settles the entity, so the second pass resolves it.
    const { model } = fakeModel([
      INTENT,
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
    ]);
    const step = await planEdit({
      dbml: DBML,
      history: [{ answer: "users", question: "Which table do you mean?" }],
      message: "change the id",
      model,
    });
    expect(step.kind).toBe("plan");
  });
});

describe("asking less", () => {
  test("a question is asked when it matters", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        clarifyingQuestion: "Should notifications be per user?",
        confidence: 0.5,
        needsClarification: true,
        suggestedOptions: ["Yes", "No"],
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "add notifications",
      model,
    });
    expect(step).toEqual({
      kind: "question",
      options: ["Yes", "No"],
      text: "Should notifications be per user?",
    });
  });

  test("low confidence with tables in hand plans instead of asking something vague", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        confidence: 0.3,
        decisions: ["Assumed: per user"],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "add notifications",
      model,
    });
    expect(step.kind).toBe("plan");
  });

  test("after two questions it stops asking, even if the model wants to", async () => {
    const { model, requests } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        clarifyingQuestion: "One more thing?",
        confidence: 0.4,
        decisions: ["Assumed: soft deletes"],
        needsClarification: true,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      history: [ROUND_1, ROUND_2],
      message: "add notification system",
      model,
    });
    expect(step.kind).toBe("plan");
    expect(requests[2]?.system).toContain("You may NOT ask a question now");
  });

  test("asking is not forced before the limit", async () => {
    const { model, requests } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        confidence: 0.9,
        decisions: [],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    await planEdit({
      dbml: DBML,
      history: [ROUND_1],
      message: "add notification system",
      model,
    });
    expect(requests[2]?.system).not.toContain("You may NOT ask a question now");
  });

  test("an unclear table after asking means the whole schema, not another question", async () => {
    const { model } = fakeModel([
      INTENT,
      {
        candidates: ["users", "todos"],
        entityConfidence: 0,
        entityName: null,
        entityType: null,
        isNewEntity: false,
        status: "ambiguous",
      },
      {
        confidence: 0.8,
        decisions: [],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      history: [ROUND_1, ROUND_2],
      message: "add notification system",
      model,
    });
    expect(step.kind).toBe("plan");
  });
});

describe("requests that name nothing", () => {
  test("a new feature on 'it' becomes a plan, not a 'which table' question", async () => {
    const { model } = fakeModel([
      INTENT,
      { ...NO_ENTITY, rawEntityMention: "it", status: "not_found" },
      {
        confidence: 0.9,
        decisions: [],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "add notification system on it",
      model,
    });
    expect(step.kind).toBe("plan");
  });

  test("a table the user named that does not exist is still asked about", async () => {
    const { model } = fakeModel([
      INTENT,
      { ...NO_ENTITY, rawEntityMention: "orders", status: "not_found" },
      { ...NO_ENTITY, rawEntityMention: "orders", status: "not_found" },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "add a column to orders",
      model,
    });
    expect(step.kind).toBe("question");
  });

  test("no usable question and no tables retries as a plan instead of asking vaguely", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      { confidence: 0.2, needsClarification: true },
      {
        confidence: 0.8,
        decisions: ["Assumed: per user"],
        needsClarification: false,
        tables: TABLES,
      },
    ]);
    const step = await planEdit({ dbml: DBML, message: "add x", model });
    expect(step.kind).toBe("plan");
  });
});

describe("odd but valid model answers", () => {
  test("an empty table list alongside a question is a question, not an error", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      {
        clarifyingQuestion: "Per user or global?",
        confidence: 0.4,
        needsClarification: true,
        tables: [],
      },
    ]);
    const step = await planEdit({ dbml: DBML, message: "add x", model });
    expect(step).toMatchObject({
      kind: "question",
      text: "Per user or global?",
    });
  });

  test("more than eight decisions are trimmed, not rejected", async () => {
    const decisions = Array.from({ length: 12 }, (_, i) => `Assumed: ${i}`);
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      { confidence: 0.9, decisions, needsClarification: false, tables: TABLES },
    ]);
    const step = await planEdit({ dbml: DBML, message: "add x", model });
    expect(step.kind).toBe("plan");
    if (step.kind === "plan") expect(step.plan.decisions).toHaveLength(8);
  });

  test("when asking is not allowed and there are no tables, it says so instead of asking", async () => {
    const { model } = fakeModel([
      INTENT,
      NO_ENTITY,
      { confidence: 0.2, needsClarification: true, tables: [] },
    ]);
    await expect(
      planEdit({
        dbml: DBML,
        history: [ROUND_1, ROUND_2],
        message: "add x",
        model,
      })
    ).rejects.toThrow("could not turn that into a plan");
  });
});

describe("going ahead", () => {
  test("saying to go ahead stops the questions at once", () => {
    for (const answer of [
      "just make it",
      "you decide",
      "go ahead",
      "make a schema",
      "I already told you, just make a schema now",
      "up to you",
    ]) {
      expect(shouldStopAsking([{ answer, question: "q" }])).toBe(true);
    }
  });
  test("an ordinary answer does not", () => {
    expect(shouldStopAsking([ROUND_1])).toBe(false);
    expect(shouldStopAsking([])).toBe(false);
  });
});
