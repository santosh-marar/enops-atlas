import { describe, expect, test } from "bun:test";
import { DEFAULT_POLICY } from "../lib/ai/execution-policy";
import {
  pickerLabel,
  pinModel,
  setThinking,
  switchControl,
  thinkingOn,
  thinkingOptions,
} from "../lib/ai/picker-policy";

const OFFERED = ["claude-sonnet-5-5", "gemini-3-1-pro", "deepseek-v4-pro"];

describe("picker policy", () => {
  test("switching to manual pins the first offered model", () => {
    expect(switchControl(DEFAULT_POLICY, OFFERED, "manual")).toEqual({
      ...DEFAULT_POLICY,
      control: "manual",
      modelKey: "claude-sonnet-5-5",
    });
  });

  test("switching to manual keeps a pinned model that is still offered", () => {
    const pinned = { ...DEFAULT_POLICY, modelKey: "gemini-3-1-pro" };
    expect(switchControl(pinned, OFFERED, "manual")?.modelKey).toBe(
      "gemini-3-1-pro"
    );
  });

  test("manual needs at least one model", () => {
    expect(switchControl(DEFAULT_POLICY, [], "manual")).toBeNull();
  });

  test("switching to agent keeps mode and thinking", () => {
    const manual = {
      ...pinModel(DEFAULT_POLICY, "claude-sonnet-5-5"),
      mode: "plan" as const,
      reasoningEffort: "high" as const,
    };
    expect(switchControl(manual, OFFERED, "agent")).toEqual({
      ...manual,
      control: "agent",
    });
  });

  test("agent offers auto plus low to high, and can be switched off", () => {
    expect(thinkingOptions(DEFAULT_POLICY)).toEqual({
      canSwitchOff: true,
      levels: ["automatic", "low", "medium", "high"],
    });
  });

  test("a pinned model offers only its own levels, and off only if it allows", () => {
    const sonnet = pinModel(DEFAULT_POLICY, "claude-sonnet-5-5");
    expect(thinkingOptions(sonnet)).toEqual({
      canSwitchOff: true,
      levels: ["automatic", "low", "medium", "high", "xhigh"],
    });
    const gemini = pinModel(DEFAULT_POLICY, "gemini-3-1-pro");
    expect(thinkingOptions(gemini)).toEqual({
      canSwitchOff: false,
      levels: ["automatic", "low", "high"],
    });
    const deepseek = pinModel(DEFAULT_POLICY, "deepseek-v4-pro");
    expect(thinkingOptions(deepseek)).toEqual({
      canSwitchOff: true,
      levels: ["automatic", "low", "high"],
    });
  });

  test("switching off sends none; on hands it back to the default", () => {
    const off = setThinking(DEFAULT_POLICY, false);
    expect(off.reasoningEffort).toBe("none");
    expect(thinkingOn(off)).toBe(false);
    expect(setThinking(off, true).reasoningEffort).toBe("automatic");
    expect(thinkingOn(DEFAULT_POLICY)).toBe(true);
  });

  test("pinning drops a setting the new model does not support", () => {
    const off = setThinking(pinModel(DEFAULT_POLICY, "deepseek-v4-pro"), false);
    expect(pinModel(off, "claude-sonnet-5-5").reasoningEffort).toBe("none");
    expect(pinModel(off, "gemini-3-1-pro").reasoningEffort).toBe("automatic");
    const xhigh = {
      ...pinModel(DEFAULT_POLICY, "claude-sonnet-5-5"),
      reasoningEffort: "xhigh" as const,
    };
    expect(pinModel(xhigh, "gemini-3-1-pro").reasoningEffort).toBe("automatic");
  });

  test("label shows the model, effort and thinking", () => {
    expect(pickerLabel(DEFAULT_POLICY)).toEqual({ level: null, model: "Auto" });
    expect(
      pickerLabel({
        ...DEFAULT_POLICY,
        complexity: "deep",
        reasoningEffort: "high",
      })
    ).toEqual({ level: "Deep · High", model: "Auto" });
    const sonnet = {
      ...pinModel(DEFAULT_POLICY, "claude-sonnet-5-5"),
      reasoningEffort: "medium" as const,
    };
    expect(pickerLabel(sonnet)).toEqual({
      level: "Medium",
      model: "Claude Sonnet 5.5",
    });
    expect(pickerLabel(setThinking(DEFAULT_POLICY, false))).toEqual({
      level: "No thinking",
      model: "Auto",
    });
  });
});
