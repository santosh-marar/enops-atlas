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
    resolveModel("claude-haiku-5-5", "dummy-A");
    resolveModel("claude-haiku-5-5", " dummy-B ");
    expect(keys).toEqual(["dummy-A", "dummy-B"]);
  });
  test("gives the gateway the provider-prefixed model id", () => {
    expect(resolveModel("claude-haiku-5-5", "k")).toMatchObject({
      modelId: "anthropic/claude-haiku-5.5",
    });
    expect(resolveModel("gpt-6-1-sol", "k")).toMatchObject({
      modelId: "openai/gpt-6.1-sol",
    });
  });
  test("gives the gateway ids for the Chinese models too", () => {
    expect(resolveModel("deepseek-v4-pro", "k")).toMatchObject({
      modelId: "deepseek/deepseek-v4-pro-0813",
    });
    expect(resolveModel("kimi-k3", "k")).toMatchObject({
      modelId: "moonshotai/kimi-k3",
    });
    expect(resolveModel("qwen-3-8-max", "k")).toMatchObject({
      modelId: "alibaba/qwen3.8-max-prime",
    });
    expect(resolveModel("glm-5-3", "k")).toMatchObject({
      modelId: "zai/glm-5.3",
    });
  });
  test("refuses an unknown model", () => {
    expect(() => resolveModel("nope" as never, "k")).toThrow("Select");
  });
  test("refuses a cleared credential", () => {
    expect(() => resolveModel("claude-haiku-5-5", " ")).toThrow("Configure");
  });
});
