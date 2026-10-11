/**
 * The models the chat can use, through the Vercel AI Gateway. Only current
 * models that can return structured output are listed, since every AI step
 * here needs it. The first three providers are the big three; the rest are
 * Chinese labs.
 */

/** How much a model thinks before answering. "automatic" leaves it to the model. */
export type ReasoningEffort =
  | "automatic"
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export const REASONING_LABEL: Record<ReasoningEffort, string> = {
  automatic: "Auto thinking",
  high: "High thinking",
  low: "Low thinking",
  medium: "Medium thinking",
  minimal: "Minimal thinking",
  none: "No thinking",
  xhigh: "Extra high thinking",
};

interface ModelDefinition {
  displayName: string;
  /** The gateway's id. */
  id: string;
  provider: Provider;
  /** Which efforts the model accepts, from the gateway's own model list. */
  reasoningEfforts: ReasoningEffort[];
}

type Provider =
  | "Anthropic"
  | "OpenAI"
  | "Google"
  | "DeepSeek"
  | "Alibaba (Qwen)"
  | "Moonshot (Kimi)"
  | "Zhipu (GLM)"
  | "MiniMax";

/** Shown in this order in the picker. */
export const PROVIDERS: Provider[] = [
  "Anthropic",
  "OpenAI",
  "Google",
  "DeepSeek",
  "Alibaba (Qwen)",
  "Moonshot (Kimi)",
  "Zhipu (GLM)",
  "MiniMax",
];

const AUTO: ReasoningEffort[] = ["automatic"];
const LOW_TO_XHIGH: ReasoningEffort[] = [
  "automatic",
  "low",
  "medium",
  "high",
  "xhigh",
];
const WITH_OFF: ReasoningEffort[] = [
  "automatic",
  "none",
  ...LOW_TO_XHIGH.slice(1),
];

const DEFINITIONS = {
  "claude-fable-5-1": {
    displayName: "Claude Fable 5.1",
    id: "anthropic/claude-fable-5.1",
    provider: "Anthropic",
    reasoningEfforts: WITH_OFF,
  },
  "claude-haiku-5-5": {
    displayName: "Claude Haiku 5.5",
    id: "anthropic/claude-haiku-5.5",
    provider: "Anthropic",
    reasoningEfforts: WITH_OFF,
  },
  "claude-opus-5-5": {
    displayName: "Claude Opus 5.5",
    id: "anthropic/claude-opus-5.5",
    provider: "Anthropic",
    reasoningEfforts: LOW_TO_XHIGH,
  },
  "claude-sonnet-5-5": {
    displayName: "Claude Sonnet 5.5",
    id: "anthropic/claude-sonnet-5.5",
    provider: "Anthropic",
    reasoningEfforts: LOW_TO_XHIGH,
  },
  "deepseek-v4-1-flash": {
    displayName: "DeepSeek V4.1 Flash",
    id: "deepseek/deepseek-v4.1-flash",
    provider: "DeepSeek",
    reasoningEfforts: ["automatic", "none", "low", "high"],
  },
  "deepseek-v4-pro": {
    displayName: "DeepSeek V4 Pro",
    id: "deepseek/deepseek-v4-pro-0813",
    provider: "DeepSeek",
    reasoningEfforts: ["automatic", "none", "low", "high"],
  },
  "gemini-3-1-pro": {
    displayName: "Gemini 3.1 Pro",
    id: "google/gemini-3.1-pro-preview",
    provider: "Google",
    reasoningEfforts: ["automatic", "low", "high"],
  },
  "gemini-3-5-flash-lite": {
    displayName: "Gemini 3.5 Flash Lite",
    id: "google/gemini-3.5-flash-lite",
    provider: "Google",
    reasoningEfforts: ["automatic", "low", "high"],
  },
  "gemini-3-8-flash": {
    displayName: "Gemini 3.8 Flash",
    id: "google/gemini-3.8-flash",
    provider: "Google",
    reasoningEfforts: ["automatic", "low", "high"],
  },
  "glm-5-3": {
    displayName: "GLM 5.3",
    id: "zai/glm-5.3",
    provider: "Zhipu (GLM)",
    reasoningEfforts: ["automatic", "low", "high"],
  },
  "glm-5-3-flash": {
    displayName: "GLM 5.3 Flash",
    id: "zai/glm-5.3-flash",
    provider: "Zhipu (GLM)",
    reasoningEfforts: ["automatic", "low", "high"],
  },
  "gpt-6-1-sol": {
    displayName: "GPT-6.1 Sol",
    id: "openai/gpt-6.1-sol",
    provider: "OpenAI",
    reasoningEfforts: LOW_TO_XHIGH,
  },
  "gpt-6-astra": {
    displayName: "GPT-6 Astra",
    id: "openai/gpt-6-astra",
    provider: "OpenAI",
    reasoningEfforts: LOW_TO_XHIGH,
  },
  "gpt-6-luna": {
    displayName: "GPT-6 Luna",
    id: "openai/gpt-6-luna",
    provider: "OpenAI",
    reasoningEfforts: WITH_OFF,
  },
  "kimi-k3": {
    displayName: "Kimi K3",
    id: "moonshotai/kimi-k3",
    provider: "Moonshot (Kimi)",
    reasoningEfforts: ["automatic", "none", "low", "high"],
  },
  "minimax-m3": {
    displayName: "MiniMax M3",
    id: "minimax/minimax-m3",
    provider: "MiniMax",
    reasoningEfforts: AUTO,
  },
  "qwen-3-8-flash": {
    displayName: "Qwen 3.8 Flash",
    id: "alibaba/qwen3.8-flash",
    provider: "Alibaba (Qwen)",
    reasoningEfforts: ["automatic", "low", "medium", "xhigh"],
  },
  "qwen-3-8-max": {
    displayName: "Qwen 3.8 Max Prime",
    id: "alibaba/qwen3.8-max-prime",
    provider: "Alibaba (Qwen)",
    reasoningEfforts: ["automatic", "low", "medium", "xhigh"],
  },
} as const satisfies Record<string, ModelDefinition>;

export type ModelKey = keyof typeof DEFINITIONS;

/** Model key to the gateway's id. */
export const MODELS = Object.fromEntries(
  Object.entries(DEFINITIONS).map(([key, model]) => [key, model.id])
) as Record<ModelKey, string>;

export const MODEL_INFO = DEFINITIONS as Record<ModelKey, ModelDefinition>;
