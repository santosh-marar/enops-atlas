import { describe, expect, test } from "bun:test";
import {
  chooseModels,
  DEFAULT_POLICY,
  inferComplexity,
  providerOptionsFor,
  reasoningFor,
} from "../lib/ai/execution-policy";
import { MODEL_INFO, MODELS, PROVIDERS } from "../lib/ai/model-registory";

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
    const small = chooseModels(DEFAULT_POLICY, {
      dbml: SMALL,
      message: "add a phone column",
    });
    expect(small.capable).toBe("claude-haiku-5-5");
    expect(small.fast).toBe("claude-haiku-5-5");
    const deep = chooseModels(DEFAULT_POLICY, {
      dbml: SMALL,
      message: "drop the users table",
    });
    expect(deep.capable).toBe("claude-opus-5-5");
    expect(deep.fast).toBe("claude-haiku-5-5");
  });

  test("a fixed complexity ignores the request", () => {
    const chosen = chooseModels(
      { ...DEFAULT_POLICY, complexity: "balanced" },
      { dbml: SMALL, message: "drop everything" }
    );
    expect(chosen.capable).toBe("claude-sonnet-5-5");
  });

  test("manual control uses the chosen model for every step", () => {
    const chosen = chooseModels(
      {
        ...DEFAULT_POLICY,
        control: "manual",
        modelKey: "gpt-6-1-sol",
        reasoningEffort: "high",
      },
      { dbml: SMALL, message: "hi" }
    );
    expect(chosen).toEqual({
      capable: "gpt-6-1-sol",
      fast: "gpt-6-1-sol",
      reasoningEffort: "high",
    });
  });

  test("an effort the model does not offer falls back to automatic", () => {
    const chosen = chooseModels(
      {
        ...DEFAULT_POLICY,
        control: "manual",
        modelKey: "minimax-m3",
        reasoningEffort: "high",
      },
      { dbml: SMALL, message: "hi" }
    );
    expect(chosen.reasoningEffort).toBe("automatic");
  });
});

describe("provider settings", () => {
  test("OpenAI models always get non-strict schemas", () => {
    expect(providerOptionsFor("gpt-6-1-sol")).toEqual({
      openai: { strictJsonSchema: false },
    });
    expect(providerOptionsFor("gpt-6-luna")).toEqual({
      openai: { strictJsonSchema: false },
    });
  });
  test("other providers send no special settings", () => {
    for (const key of [
      "claude-sonnet-5-5",
      "gemini-3-8-flash",
      "deepseek-v4-pro",
      "kimi-k3",
      "glm-5-3",
    ] as const) {
      expect(providerOptionsFor(key)).toBeUndefined();
    }
  });
});

describe("reasoning", () => {
  test("an effort the model offers is passed on", () => {
    expect(reasoningFor("gpt-6-1-sol", "high")).toBe("high");
    expect(reasoningFor("deepseek-v4-pro", "none")).toBe("none");
    expect(reasoningFor("gemini-3-8-flash", "low")).toBe("low");
    expect(reasoningFor("qwen-3-8-max", "xhigh")).toBe("xhigh");
  });
  test("automatic, and efforts the model does not offer, leave it to the model", () => {
    expect(reasoningFor("gpt-6-1-sol", "automatic")).toBeUndefined();
    // Gemini only offers low and high
    expect(reasoningFor("gemini-3-8-flash", "medium")).toBeUndefined();
    // MiniMax has no effort option at all
    expect(reasoningFor("minimax-m3", "high")).toBeUndefined();
    // Opus cannot turn thinking off
    expect(reasoningFor("claude-opus-5-5", "none")).toBeUndefined();
  });
});

describe("the catalog", () => {
  test("has the latest from the big three and the main Chinese labs", () => {
    const keys = Object.keys(MODELS);
    for (const key of [
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
      "gpt-6-1-sol",
      "gemini-3-8-flash",
      "deepseek-v4-pro",
      "qwen-3-8-max",
      "kimi-k3",
      "glm-5-3",
      "minimax-m3",
    ]) {
      expect(keys).toContain(key);
    }
  });
  test("has no old models", () => {
    for (const id of Object.values(MODELS)) {
      expect(id).not.toMatch(
        /claude-(3|4)|gpt-(3|4|5)|gemini-(2|1)|deepseek-(r1|v3)/
      );
    }
  });
  test("every model has a picker entry and every provider is listed", () => {
    for (const key of Object.keys(MODELS) as (keyof typeof MODELS)[]) {
      expect(MODEL_INFO[key].reasoningEfforts[0]).toBe("automatic");
      expect(PROVIDERS).toContain(MODEL_INFO[key].provider);
    }
  });
});
