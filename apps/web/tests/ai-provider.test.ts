import { describe, expect, mock, test } from "bun:test";

const keys: string[] = [];
mock.module("ai", () => ({
  createGateway: ({ apiKey }: { apiKey: string }) => {
    keys.push(apiKey);
    return (modelId: string) => ({ modelId, provider: "mock" });
  },
}));
const { resolveModel } = await import("../lib/ai/provider");

describe("request credentials", () => {
  test("uses the current key immediately after settings change", () => {
    keys.length = 0;
    resolveModel("claude-haiku-4-5", "dummy-A");
    resolveModel("claude-haiku-4-5", " dummy-B ");
    expect(keys).toEqual(["dummy-A", "dummy-B"]);
  });
  test("gives the gateway the provider-prefixed model id", () => {
    expect(resolveModel("claude-haiku-4-5", "k")).toMatchObject({
      modelId: "anthropic/claude-haiku-4-5",
    });
    expect(resolveModel("gpt-5-5", "k")).toMatchObject({
      modelId: "openai/gpt-5.5",
    });
  });
  test("refuses an unknown model", () => {
    expect(() => resolveModel("nope" as never, "k")).toThrow("Select");
  });
  test("refuses a cleared credential", () => {
    expect(() => resolveModel("claude-haiku-4-5", " ")).toThrow("Configure");
  });
});
