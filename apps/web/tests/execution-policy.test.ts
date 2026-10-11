import { describe, expect, test } from "bun:test";
import {
  chooseModels,
  DEFAULT_POLICY,
  inferComplexity,
  providerOptionsFor,
} from "../lib/ai/execution-policy";

const SMALL = "Table a { id int [pk] }";

describe("complexity", () => {
  test("a short request on a small schema is fast", () => {
    expect(inferComplexity("add a phone column", SMALL)).toBe("fast");
  });
  test("renaming or removing is treated as deep, since things depend on it", () => {
    expect(inferComplexity("rename users to accounts", SMALL)).toBe("deep");
  });
  test("a large schema is deep", () => {
    const big = Array.from({ length: 31 }, (_, i) => `Table t${i} { id int }`);
    expect(inferComplexity("add a column", big.join("\n"))).toBe("deep");
  });
  test("everything else is balanced", () => {
    expect(inferComplexity("x".repeat(200), SMALL)).toBe("balanced");
  });
});

describe("choosing models", () => {
  test("agent control picks the model from the task and keeps quick steps cheap", () => {
    const chosen = chooseModels(DEFAULT_POLICY, {
      dbml: SMALL,
      message: "add a phone column",
    });
    expect(chosen.capable).toBe("claude-haiku-4-5");
    expect(chosen.fast).toBe("claude-haiku-4-5");
    const deep = chooseModels(DEFAULT_POLICY, {
      dbml: SMALL,
      message: "drop the users table",
    });
    expect(deep.capable).toBe("claude-sonnet-5");
    expect(deep.fast).toBe("claude-haiku-4-5");
  });

  test("a fixed complexity ignores the request", () => {
    const chosen = chooseModels(
      { ...DEFAULT_POLICY, complexity: "balanced" },
      { dbml: SMALL, message: "drop everything" }
    );
    expect(chosen.capable).toBe("claude-sonnet-4-6");
  });

  test("manual control uses the chosen model for every step", () => {
    const chosen = chooseModels(
      {
        ...DEFAULT_POLICY,
        control: "manual",
        modelKey: "gpt-5-4",
        reasoningEffort: "high",
      },
      { dbml: SMALL, message: "hi" }
    );
    expect(chosen).toEqual({
      capable: "gpt-5-4",
      fast: "gpt-5-4",
      reasoningEffort: "high",
    });
  });

  test("an effort the model does not offer falls back to automatic", () => {
    const chosen = chooseModels(
      {
        ...DEFAULT_POLICY,
        control: "manual",
        modelKey: "claude-sonnet-5",
        reasoningEffort: "high",
      },
      { dbml: SMALL, message: "hi" }
    );
    expect(chosen.reasoningEffort).toBe("automatic");
  });
});

describe("reasoning settings", () => {
  test("OpenAI reasoning models get an effort", () => {
    expect(providerOptionsFor("gpt-5-5", "low")).toEqual({
      openai: { reasoningEffort: "low" },
    });
  });
  test("Gemini 2.5 gets a thinking budget", () => {
    expect(providerOptionsFor("gemini-2-5-pro", "high")).toEqual({
      google: { thinkingConfig: { thinkingBudget: 24_576 } },
    });
  });
  test("automatic, and models without the setting, send nothing", () => {
    expect(providerOptionsFor("gpt-5-5", "automatic")).toBeUndefined();
    expect(providerOptionsFor("claude-sonnet-5", "high")).toBeUndefined();
    expect(providerOptionsFor("gpt-4-1", "high")).toBeUndefined();
  });
});
