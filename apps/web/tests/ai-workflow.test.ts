import { describe, expect, test } from "bun:test";
import type { SchemaModel } from "@enops/atlas-schema-intelligence/ai";
import {
  mentionSuggestions,
  planEdit,
  toSchemaIR,
} from "../lib/ai/edit-workflow";
import { generateFromPlan } from "../lib/ai/schema-flow";

const DBML = `
Table users {
  id uuid [pk]
  email varchar
}

Table posts {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  title varchar
}
`;

/** Answers from a list in order, and remembers what it was asked. */
const fakeModel = (answers: unknown[]) => {
  const asked: string[] = [];
  const model: SchemaModel = {
    generateObject: async (request) => {
      asked.push(request.system.slice(0, 60));
      if (answers.length === 0) throw new Error("model called too many times");
      return { object: answers.shift() as never };
    },
  };
  return { asked, model };
};

const INTENT_ADD = { intentConfidence: 0.95, intentType: "add" };
const ENTITY_USERS = {
  entityConfidence: 0.9,
  entityName: "users",
  entityType: "table",
  isNewEntity: false,
  status: "resolved",
};
const PLAN_USERS = {
  confidence: 0.9,
  decisions: [],
  needsClarification: false,
  tables: [{ isNew: false, name: "users" }],
};

describe("planning an edit", () => {
  test("a clear request finds the table, then proposes a plan and changes nothing", async () => {
    const { model, asked } = fakeModel([INTENT_ADD, ENTITY_USERS, PLAN_USERS]);
    const step = await planEdit({
      dbml: DBML,
      message: "add a phone column to users",
      model,
    });
    expect(step.kind).toBe("plan");
    if (step.kind === "plan") {
      expect(step.plan.entityName).toBe("users");
      // the writer is given the part of the schema around users
      expect(step.retrievedContext).toContain("users");
    }
    // intent, entity, plan: three questions to the model, no DBML written
    expect(asked).toHaveLength(3);
  });

  test("an ambiguous request asks which one instead of guessing", async () => {
    const { model, asked } = fakeModel([
      INTENT_ADD,
      {
        candidates: ["users.id", "posts.id"],
        entityConfidence: 0,
        entityName: null,
        entityType: null,
        isNewEntity: false,
        rawEntityMention: "id",
        status: "ambiguous",
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "change the id",
      model,
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.options).toEqual(["users.id", "posts.id"]);
    }
    expect(asked).toHaveLength(2);
  });

  test("an unknown table asks instead of inventing one", async () => {
    const { model } = fakeModel([
      INTENT_ADD,
      {
        entityConfidence: 0,
        entityName: null,
        entityType: null,
        isNewEntity: false,
        rawEntityMention: "orders",
        status: "not_found",
      },
      // the resolver tries once more with the full schema before giving up
      {
        entityConfidence: 0,
        entityName: null,
        entityType: null,
        isNewEntity: false,
        rawEntityMention: "orders",
        status: "not_found",
      },
    ]);
    const step = await planEdit({
      dbml: DBML,
      message: "add x to orders",
      model,
    });
    expect(step.kind).toBe("question");
    if (step.kind === "question") {
      expect(step.options).toEqual(["users", "posts"]);
    }
  });

  test("the user's earlier answers are sent along", async () => {
    const seen: string[] = [];
    const model: SchemaModel = {
      generateObject: async (request) => {
        seen.push(`${request.prompt ?? ""} ${request.system}`);
        const answers: unknown[] = [INTENT_ADD, ENTITY_USERS, PLAN_USERS];
        return { object: answers[seen.length - 1] as never };
      },
    };
    await planEdit({
      dbml: DBML,
      history: [{ answer: "the users table", question: "Which table?" }],
      message: "add a phone column",
      model,
    });
    expect(seen.join("\n")).toContain("the users table");
  });
});

describe("checking what the AI changed", () => {
  const plan = {
    decisions: [],
    entityName: "users",
    generationPrompt: "",
    id: "p1",
    operationType: "add" as const,
    originalPrompt: "add phone",
    tables: [{ isNew: false, name: "users" }],
  };

  test("a change inside the plan is not flagged", async () => {
    const inside = DBML.replace(
      "email varchar",
      "email varchar\n  phone varchar"
    );
    const { model } = fakeModel([{ dbml: inside }]);
    const proposal = await generateFromPlan({ dbml: DBML, model, plan });
    expect(proposal.valid).toBe(true);
    expect(proposal.outsidePlan).toEqual([]);
  });

  test("a change to a table outside the plan is reported", async () => {
    const sneaky = DBML.replace(
      "email varchar",
      "email varchar\n  phone varchar"
    ).replace("title varchar", "title text");
    const { model } = fakeModel([{ dbml: sneaky }]);
    const proposal = await generateFromPlan({ dbml: DBML, model, plan });
    expect(proposal.outsidePlan).toEqual(["public.posts"]);
  });

  test("DBML that does not pass the checks is never marked valid", async () => {
    const { model } = fakeModel([
      { dbml: "Table users {" },
      { dbml: "Table users {" },
      { dbml: "Table users {" },
      { dbml: "Table users {" },
    ]);
    const proposal = await generateFromPlan({ dbml: DBML, model, plan });
    expect(proposal.valid).toBe(false);
  });
});

describe("@ mentions", () => {
  test("suggests tables and columns that exist", () => {
    expect(mentionSuggestions(DBML, "user")).toContain("users");
    expect(mentionSuggestions(DBML, "user")).toContain("posts.user_id");
    expect(mentionSuggestions(DBML, "zzz")).toEqual([]);
  });

  test("the schema view lists every table and column", () => {
    const ir = toSchemaIR(DBML);
    expect(ir.tables.map((t) => t.name)).toEqual(["users", "posts"]);
    expect(ir.tables[1]?.columns.map((c) => c.name)).toEqual([
      "id",
      "user_id",
      "title",
    ]);
  });
});
