import {
  MODEL_INFO,
  MODELS,
  type ModelKey,
  type ReasoningEffort,
} from "./model-registory";

export type { ReasoningEffort };

/** auto: plan, then ask. plan: only plan. build: plan, then write the schema straight away. */
export type ExecutionMode = "auto" | "plan" | "build";
/** agent: the app picks the model for the task. manual: you pick it. */
export type ExecutionControl = "agent" | "manual";
export type ExecutionComplexity = "auto" | "fast" | "balanced" | "deep";

export interface ExecutionPolicy {
  complexity: ExecutionComplexity;
  control: ExecutionControl;
  mode: ExecutionMode;
  modelKey?: ModelKey;
  reasoningEffort: ReasoningEffort;
}

export const DEFAULT_POLICY: ExecutionPolicy = {
  complexity: "auto",
  control: "agent",
  mode: "auto",
  reasoningEffort: "automatic",
};

/** Small questions go to the cheap model for every step. */
const FAST_MODEL: ModelKey = "claude-haiku-5-5";
const COMPLEXITY_MODEL: Record<
  Exclude<ExecutionComplexity, "auto">,
  ModelKey
> = {
  balanced: "claude-sonnet-5-5",
  deep: "claude-opus-5-5",
  fast: "claude-haiku-5-5",
};

const RISKY_WORDS = /\b(rename|remove|drop|delete|migrate|split|merge)\b/i;

/** Guesses how hard a request is from its size and the schema it touches. */
export function inferComplexity(
  message: string,
  dbml: string
): Exclude<ExecutionComplexity, "auto"> {
  const tables = (dbml.match(/^\s*table\s/gim) ?? []).length;
  if (tables > 30 || message.length > 600 || RISKY_WORDS.test(message)) {
    return "deep";
  }
  if (message.length < 120 && tables <= 10) return "fast";
  return "balanced";
}

export interface ChosenModels {
  /** Used for the capable tier: the plan and the schema itself. */
  capable: ModelKey;
  /** Used for the quick steps: intent and which table you mean. */
  fast: ModelKey;
  reasoningEffort: ReasoningEffort;
}

/** Which models run this request, from the policy and the request itself. */
export function chooseModels(
  policy: ExecutionPolicy,
  context: { dbml: string; message: string }
): ChosenModels {
  if (policy.control === "manual" && policy.modelKey) {
    const efforts = MODEL_INFO[policy.modelKey].reasoningEfforts;
    return {
      capable: policy.modelKey,
      fast: policy.modelKey,
      reasoningEffort: efforts.includes(policy.reasoningEffort)
        ? policy.reasoningEffort
        : "automatic",
    };
  }
  const complexity =
    policy.complexity === "auto"
      ? inferComplexity(context.message, context.dbml)
      : policy.complexity;
  return {
    capable: COMPLEXITY_MODEL[complexity],
    fast: FAST_MODEL,
    reasoningEffort: "automatic",
  };
}

type ProviderOptions = Record<string, Record<string, unknown>> | undefined;

/**
 * Provider settings for one request. OpenAI rejects the pipeline's schemas in
 * strict mode (they have optional fields), so strict mode is always off there.
 * Reasoning is not set here: it goes through the SDK's own `reasoning` option,
 * which the gateway maps for every provider.
 */
export function providerOptionsFor(modelKey: ModelKey): ProviderOptions {
  return MODELS[modelKey].startsWith("openai/")
    ? { openai: { strictJsonSchema: false } }
    : undefined;
}

/** The SDK's `reasoning` value for an effort, or undefined to leave it to the model. */
export function reasoningFor(
  modelKey: ModelKey,
  effort: ReasoningEffort
): Exclude<ReasoningEffort, "automatic"> | undefined {
  if (effort === "automatic") return undefined;
  return MODEL_INFO[modelKey].reasoningEfforts.includes(effort)
    ? effort
    : undefined;
}

const STORAGE_KEY = "atlas-ai-policy";

const isOneOf = <T extends string>(
  value: unknown,
  options: readonly T[]
): value is T =>
  typeof value === "string" && (options as readonly string[]).includes(value);

/** Reads the saved policy, ignoring anything that is not valid. */
export function loadPolicy(): ExecutionPolicy {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return DEFAULT_POLICY;
    const modelKey =
      typeof saved.modelKey === "string" && saved.modelKey in MODELS
        ? (saved.modelKey as ModelKey)
        : undefined;
    return {
      complexity: isOneOf(saved.complexity, [
        "auto",
        "fast",
        "balanced",
        "deep",
      ])
        ? saved.complexity
        : DEFAULT_POLICY.complexity,
      control: saved.control === "manual" && modelKey ? "manual" : "agent",
      mode: isOneOf(saved.mode, ["auto", "plan", "build"])
        ? saved.mode
        : DEFAULT_POLICY.mode,
      modelKey,
      reasoningEffort: isOneOf(saved.reasoningEffort, [
        "automatic",
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
      ])
        ? saved.reasoningEffort
        : "automatic",
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

export function savePolicy(policy: ExecutionPolicy): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
  } catch {
    // The choice just isn't remembered.
  }
}
