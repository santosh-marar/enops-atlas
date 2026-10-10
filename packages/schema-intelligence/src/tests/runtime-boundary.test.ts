import { describe, expect, test } from "bun:test";
import { sha256Hex } from "@enops/atlas-schema";
import { generateDbmlPipeline } from "../ai/generate-schema-dbml";
import type { SchemaModel, SchemaModelRequest } from "../model";

function scriptedModel(values: unknown[]) {
  const calls: SchemaModelRequest<unknown>[] = [];
  const model: SchemaModel = {
    async generateObject<T>(request: SchemaModelRequest<T>) {
      calls.push(request as SchemaModelRequest<unknown>);
      const value = values.shift();
      return { object: request.schema.parse(value) };
    },
  };
  return { calls, model };
}

describe("Cloud and OSS runtime boundary", () => {
  test("portable SHA-256 matches the standard digest", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  test("an injected model runs the same validated retry pipeline", async () => {
    const { calls, model } = scriptedModel([
      { dbml: "Table broken {" },
      { dbml: "Table users {\n id uuid [pk]\n}" },
    ]);
    const result = await generateDbmlPipeline({
      maxRetries: 1,
      model,
      prompt: "Create users",
      system: "Return DBML",
    });

    expect(result.valid).toBe(true);
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.tier === "capable")).toBe(true);
    expect(calls[1]?.messages).toHaveLength(3);
  });

  test("automatic correction stops at the configured retry cap", async () => {
    const { calls, model } = scriptedModel([
      { dbml: "Table broken {" },
      { dbml: "Table still_broken {" },
      { dbml: "Table never_reached {" },
    ]);
    const result = await generateDbmlPipeline({
      maxRetries: 1,
      model,
      prompt: "Create users",
      system: "Return DBML",
    });

    expect(result.parseFailed).toBe(true);
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });
});
