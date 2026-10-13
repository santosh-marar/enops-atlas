import { expect, test } from "bun:test";
import { buildPlan } from "../ai-workflow/build-plan";
import { resolveEntity } from "../ai-workflow/entity-resolver";
import { generateDbmlFromPlan } from "../ai-workflow/generate-dbml";
import { resolveIntent } from "../ai-workflow/intent-resolver";
import { isQualityRequest, qualityBriefOf } from "../ai-workflow/quality-goal";
import type { SchemaModel } from "../model";

const BAD = `Table users {
  id uuid [pk]
  email varchar
}

Table posts {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  title varchar
}`;

const neverCalled: SchemaModel = {
  generateObject: () => {
    throw new Error("the model should not be asked");
  },
};

test("quality requests are recognised, ordinary ones are not", () => {
  for (const text of [
    "make sure we can achieve 100% percent quality",
    "make it production ready",
    "follow best practices",
    "optimize the schema",
    "improve my database design",
  ]) {
    expect(isQualityRequest(text)).toBe(true);
  }
  for (const text of [
    "add an audit log table",
    "add a phone column to users",
    "optimize the query for users.email",
  ]) {
    expect(isQualityRequest(text)).toBe(false);
  }
});

test("a quality request needs no model to classify, find the table or plan", async () => {
  const text = "make it production ready";
  expect(await resolveIntent(text, neverCalled)).toEqual({
    intentConfidence: 1,
    intentType: "modify",
  });
  const entity = await resolveEntity(
    text,
    "modify",
    { tables: [] } as never,
    neverCalled
  );
  expect(entity.status).toBe("not_applicable");

  const brief = qualityBriefOf(BAD);
  expect(brief?.issues.length).toBeGreaterThan(0);
  const planned = await buildPlan({
    entityName: null,
    existingDbml: BAD,
    intentType: "modify",
    isNewEntity: false,
    model: neverCalled,
    originalMessage: text,
    retrievedContext: "",
    transcript: text,
  });
  expect(planned.status).toBe("ready");
  if (planned.status !== "ready") return;
  expect(planned.plan.goal).toBe("quality");
  expect(planned.plan.tables.map((table) => table.name)).toContain("users");
  expect(planned.plan.decisions.length).toBe(brief?.issues.length ?? 0);
});

test("a schema with no hints says so instead of planning", async () => {
  const clean = `Table users {
  id uuid [pk]
  email varchar [unique, not null]
  created_at timestamp
  updated_at timestamp
  deleted_at timestamp
}`;
  const planned = await buildPlan({
    entityName: null,
    existingDbml: clean,
    intentType: "modify",
    isNewEntity: false,
    model: neverCalled,
    originalMessage: "make it production ready",
    retrievedContext: "",
    transcript: "make it production ready",
  });
  expect(planned.status).toBe(
    qualityBriefOf(clean)?.issues.length === 0 ? "answered" : "ready"
  );
});

test("writing a quality plan scores the result and goes again while hints are left", async () => {
  const half = `Table users {
  id uuid [pk]
  email varchar [unique, not null]
  created_at timestamp
  updated_at timestamp
  deleted_at timestamp
}

Table posts {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  title varchar
}`;
  const full = `${half.split("\n\nTable posts")[0]}

Table posts {
  id uuid [pk]
  user_id uuid [ref: > users.id]
  title varchar
  created_at timestamp
  updated_at timestamp
  deleted_at timestamp
  indexes {
    user_id
  }
}`;
  const answers = [half, full];
  let calls = 0;
  const model: SchemaModel = {
    generateObject: async <T>() => {
      const dbml = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return { object: { dbml } as T };
    },
  };
  const planned = await buildPlan({
    entityName: null,
    existingDbml: BAD,
    intentType: "modify",
    isNewEntity: false,
    model: neverCalled,
    originalMessage: "100% quality",
    retrievedContext: "",
    transcript: "100% quality",
  });
  if (planned.status !== "ready") throw new Error("expected a plan");
  const result = await generateDbmlFromPlan({
    existingDbml: BAD,
    model,
    plan: planned.plan,
  });
  expect(calls).toBe(2);
  expect(qualityBriefOf(result.dbml)?.issues).toHaveLength(0);
});

test("a performance request is a change to the whole schema, and its plan carries the goal", async () => {
  const text = "optimize performance";
  expect((await resolveIntent(text, neverCalled)).intentType).toBe("modify");
  const model: SchemaModel = {
    generateObject: async <T>() => ({
      object: {
        confidence: 0.9,
        decisions: ["Index the foreign keys"],
        needsClarification: false,
        tables: [{ isNew: false, name: "posts" }],
      } as T,
    }),
  };
  const planned = await buildPlan({
    entityName: null,
    existingDbml: BAD,
    intentType: "modify",
    isNewEntity: false,
    model,
    originalMessage: text,
    retrievedContext: "",
    transcript: text,
  });
  if (planned.status !== "ready") throw new Error("expected a plan");
  expect(planned.plan.goal).toBe("performance");
});

test("when the model's plan cannot be read, the request goes ahead over the whole schema instead of failing", async () => {
  const unreadable = new Error(
    "No object generated: could not parse the response."
  );
  unreadable.name = "AI_NoObjectGeneratedError";
  const model: SchemaModel = {
    generateObject: async () => {
      throw unreadable;
    },
  };
  const planned = await buildPlan({
    entityName: null,
    existingDbml: BAD,
    intentType: "modify",
    isNewEntity: false,
    model,
    originalMessage: "add soft delete everywhere",
    retrievedContext: "",
    transcript: "add soft delete everywhere",
  });
  if (planned.status !== "ready") throw new Error("expected a plan");
  expect(planned.plan.tables.map((table) => table.name)).toEqual([
    "users",
    "posts",
  ]);
  expect(planned.plan.decisions[0]).toContain("add soft delete everywhere");

  // Without the schema there is nothing to fall back on, so the error is real.
  await expect(
    buildPlan({
      entityName: null,
      intentType: "modify",
      isNewEntity: false,
      model,
      originalMessage: "x",
      retrievedContext: "",
      transcript: "x",
    })
  ).rejects.toThrow("could not parse");
});
