import { describe, expect, test } from "bun:test";
import {
  buildCatalog,
  type GatewayModel,
  latestClaude,
} from "../lib/ai/live-models";
import type { ModelDefinition } from "../lib/ai/model-registory";

const DAY = 86_400;
const NOW = 1_790_000_000;
const model = (
  id: string,
  daysAgo: number,
  extra: Partial<GatewayModel> = {}
): GatewayModel => ({
  id,
  released: NOW - daysAgo * DAY,
  tags: ["structured-output"],
  type: "language",
  ...extra,
});
const known: Record<string, ModelDefinition> = {
  "claude-sonnet-5-5": {
    displayName: "Claude Sonnet 5.5",
    id: "anthropic/claude-sonnet-5.5",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
  "old-one": {
    displayName: "Old One",
    id: "anthropic/claude-old",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
};

describe("live catalog", () => {
  test("a brand new model appears with its own id and thinking levels", () => {
    const { models } = buildCatalog(
      [
        model("anthropic/claude-sonnet-5.5", 20),
        model("anthropic/claude-sonnet-6", 1, {
          name: "Claude Sonnet 6",
          reasoning_options: [
            { type: "effort", values: ["low", "high", "max"] },
          ],
        }),
      ],
      known
    );
    expect(models["anthropic/claude-sonnet-6"]).toEqual({
      displayName: "Claude Sonnet 6",
      id: "anthropic/claude-sonnet-6",
      provider: "Anthropic",
      reasoningEfforts: ["automatic", "low", "high"],
    });
  });

  test("image, fast and dated variants and models without structured output are left out", () => {
    const { models } = buildCatalog(
      [
        model("google/gemini-9-flash", 1),
        model("google/gemini-9-flash-image", 1),
        model("google/gemini-9-flash-fast", 1),
        model("google/gemini-9-flash-0801", 1),
        model("google/gemini-9-pro", 1, { tags: [] }),
        model("unknown-lab/thing", 1),
      ],
      {}
    );
    expect(Object.keys(models)).toEqual(["google/gemini-9-flash"]);
  });

  test("models that are retired or far behind the newest are hidden", () => {
    const { hide } = buildCatalog(
      [
        model("anthropic/claude-sonnet-5.5", 1),
        model("anthropic/claude-old", 600),
      ],
      known
    );
    expect(hide).toEqual(["old-one"]);
    const retired = buildCatalog(
      [model("anthropic/claude-sonnet-5.5", 1)],
      known
    );
    expect(retired.hide).toEqual(["old-one"]);
  });

  test("a built-in model is not duplicated under its gateway id", () => {
    const { models } = buildCatalog(
      [model("anthropic/claude-sonnet-5.5", 1)],
      known
    );
    expect(models).toEqual({});
  });
});

describe("agent mode follows the newest Claude", () => {
  const ids = {
    a: "anthropic/claude-sonnet-5.5",
    b: "anthropic/claude-sonnet-6",
    c: "anthropic/claude-sonnet-5.5-fast",
    d: "anthropic/claude-haiku-5.5",
  };
  test("picks the highest version of a size", () => {
    expect(latestClaude("sonnet", "fallback", ids)).toBe("b");
    expect(latestClaude("haiku", "fallback", ids)).toBe("d");
  });
  test("falls back when none is listed", () => {
    expect(latestClaude("opus", "fallback", ids)).toBe("fallback");
  });
});
