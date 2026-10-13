import type { ExecutionPolicy } from "./execution-policy";
import {
  type ModelKey,
  modelInfo,
  type ReasoningEffort,
} from "./model-registory";

/** Levels offered while the app picks the model; a model that lacks one ignores it. */
const AGENT_LEVELS: ReasoningEffort[] = ["low", "medium", "high"];

const SHORT: Record<ReasoningEffort, string> = {
  automatic: "Auto",
  high: "High",
  low: "Low",
  medium: "Medium",
  minimal: "Minimal",
  none: "No thinking",
  xhigh: "Max",
};

const COMPLEXITY_LABEL: Record<ExecutionPolicy["complexity"], string> = {
  auto: "Auto",
  balanced: "Balanced",
  deep: "Deep",
  fast: "Fast",
};

export const shortEffort = (effort: ReasoningEffort) => SHORT[effort];

/** Thinking is off only when switched off; automatic still thinks by default. */
export const thinkingOn = (policy: ExecutionPolicy) =>
  policy.reasoningEffort !== "none";

/** Pin a model, keeping the thinking level only if the model supports it. */
export function pinModel(
  policy: ExecutionPolicy,
  modelKey: ModelKey
): ExecutionPolicy {
  return {
    ...policy,
    control: "manual",
    modelKey,
    reasoningEffort: modelInfo(modelKey).reasoningEfforts.includes(
      policy.reasoningEffort
    )
      ? policy.reasoningEffort
      : "automatic",
  };
}

/**
 * Agent hands model choice back to the app. Manual keeps the pinned model when
 * it is still offered, otherwise pins the first one; null when none exist.
 */
export function switchControl(
  policy: ExecutionPolicy,
  offered: ModelKey[],
  control: ExecutionPolicy["control"]
): ExecutionPolicy | null {
  if (control === "agent") return { ...policy, control: "agent" };
  const modelKey =
    policy.modelKey && offered.includes(policy.modelKey)
      ? policy.modelKey
      : offered[0];
  return modelKey ? pinModel(policy, modelKey) : null;
}

/**
 * Thinking settings on offer. Agent offers auto plus low to high (a model that
 * lacks one ignores it); a pinned model offers only its own, and can be
 * switched off only if it allows.
 */
export function thinkingOptions(policy: ExecutionPolicy): {
  canSwitchOff: boolean;
  levels: ReasoningEffort[];
} {
  if (policy.control !== "manual" || !policy.modelKey) {
    return { canSwitchOff: true, levels: ["automatic", ...AGENT_LEVELS] };
  }
  const efforts = modelInfo(policy.modelKey).reasoningEfforts;
  const levels = efforts.filter(
    (effort) => effort !== "automatic" && effort !== "none"
  );
  return {
    canSwitchOff: efforts.includes("none"),
    levels: levels.length > 0 ? ["automatic", ...levels] : [],
  };
}

/** Off disables thinking where the model allows; on hands it back to the default. */
export function setThinking(
  policy: ExecutionPolicy,
  on: boolean
): ExecutionPolicy {
  return { ...policy, reasoningEffort: on ? "automatic" : "none" };
}

/** What the composer shows: model name (or Auto) and the effort or thinking level. */
export function pickerLabel(policy: ExecutionPolicy) {
  const manual = policy.control === "manual" && Boolean(policy.modelKey);
  const parts: string[] = [];
  if (!manual && policy.complexity !== "auto") {
    parts.push(COMPLEXITY_LABEL[policy.complexity]);
  }
  if (policy.reasoningEffort !== "automatic") {
    parts.push(SHORT[policy.reasoningEffort]);
  }
  return {
    level: parts.length > 0 ? parts.join(" · ") : null,
    model:
      manual && policy.modelKey
        ? modelInfo(policy.modelKey).displayName
        : "Auto",
  };
}
