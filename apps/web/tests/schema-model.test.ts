import { describe, expect, mock, test } from "bun:test";

const calls: Record<string, unknown>[] = [];
/** Set to make the next request fail once when it carries reasoning settings. */
let rejectReasoning = false;
mock.module("ai", () => ({
  createGateway: () => (modelId: string) => ({ modelId }),
  generateObject: async (options: Record<string, unknown>) => {
    calls.push(options);
    if (
      rejectReasoning &&
      JSON.stringify(options.providerOptions ?? {}).includes("reasoningEffort")
    ) {
      throw new Error("reasoning not supported");
    }
    return { object: { dbml: "Table t { id int [pk] }" } };
  },
}));

const { schemaModel } = await import("../lib/ai/schema-model");

const modelIdOf = (call: Record<string, unknown> | undefined) =>
  (call?.model as { modelId: string } | undefined)?.modelId;

describe("schema model adapter", () => {
  // The adapter never looks inside the schema; it only hands it to the SDK.
  const schema = { parse: (value: unknown) => value } as never;

  test("passes the request to the model and returns the object", async () => {
    calls.length = 0;
    const model = schemaModel("claude-haiku-4-5", "dummy-key");
    const { object } = await model.generateObject({
      maxOutputTokens: 100,
      messages: [{ content: "hi", role: "user" }],
      schema,
      system: "be brief",
    });
    expect((object as { dbml: string }).dbml).toContain("Table t");
    expect(calls[0]?.system).toBe("be brief");
    expect(calls[0]?.maxOutputTokens).toBe(100);
  });

  test("the key is not part of anything sent as the prompt", async () => {
    calls.length = 0;
    await schemaModel("claude-haiku-4-5", "dummy-secret-key").generateObject({
      maxOutputTokens: 10,
      prompt: "make a table",
      schema,
      system: "s",
    });
    expect(JSON.stringify(calls[0])).not.toContain("dummy-secret-key");
  });

  test("a missing key is refused before any request", async () => {
    calls.length = 0;
    const model = schemaModel("claude-haiku-4-5", " ");
    await expect(
      model.generateObject({ maxOutputTokens: 10, schema, system: "s" })
    ).rejects.toThrow("Configure");
    expect(calls).toHaveLength(0);
  });

  test("quick steps use the fast model and the rest use the main one", async () => {
    calls.length = 0;
    const model = schemaModel("claude-sonnet-5", "k", {
      fastModelKey: "claude-haiku-4-5",
    });
    await model.generateObject({
      maxOutputTokens: 10,
      schema,
      system: "s",
      tier: "fast",
    });
    await model.generateObject({
      maxOutputTokens: 10,
      schema,
      system: "s",
      tier: "capable",
    });
    expect(modelIdOf(calls[0])).toBe("anthropic/claude-haiku-4-5");
    expect(modelIdOf(calls[1])).toBe("anthropic/claude-sonnet-5");
  });

  test("reasoning effort goes only to the capable steps", async () => {
    calls.length = 0;
    const model = schemaModel("gpt-5-5", "k", { reasoningEffort: "high" });
    await model.generateObject({
      maxOutputTokens: 10,
      schema,
      system: "s",
      tier: "fast",
    });
    await model.generateObject({
      maxOutputTokens: 10,
      schema,
      system: "s",
      tier: "capable",
    });
    // The quick step gets no effort, but still the non-strict OpenAI setting.
    expect(calls[0]?.providerOptions).toEqual({
      openai: { strictJsonSchema: false },
    });
    expect(calls[1]?.providerOptions).toEqual({
      openai: { reasoningEffort: "high", strictJsonSchema: false },
    });
  });

  test("a model that rejects the reasoning setting is asked again without it", async () => {
    calls.length = 0;
    rejectReasoning = true;
    const { object } = await schemaModel("gpt-5-5", "k", {
      reasoningEffort: "low",
    }).generateObject({ maxOutputTokens: 10, schema, system: "s" });
    rejectReasoning = false;
    expect((object as { dbml: string }).dbml).toContain("Table t");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.providerOptions).toEqual({
      openai: { strictJsonSchema: false },
    });
  });

  test("stop is passed to the request, and retries are bounded", async () => {
    calls.length = 0;
    const controller = new AbortController();
    await schemaModel("claude-haiku-4-5", "k", {
      maxRetries: 1,
      signal: controller.signal,
    }).generateObject({ maxOutputTokens: 10, schema, system: "s" });
    expect(calls[0]?.abortSignal).toBe(controller.signal);
    expect(calls[0]?.maxRetries).toBe(1);
  });

  test("each request is reported, with its number", async () => {
    const seen: number[] = [];
    const model = schemaModel("claude-haiku-4-5", "k", {
      onCall: ({ attempt }) => seen.push(attempt),
    });
    await model.generateObject({ maxOutputTokens: 10, schema, system: "s" });
    await model.generateObject({ maxOutputTokens: 10, schema, system: "s" });
    expect(seen).toEqual([1, 2]);
  });
});
