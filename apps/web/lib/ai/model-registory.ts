export const MODELS = {
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "claude-opus-4-8": "anthropic/claude-opus-4-8",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-sonnet-5": "anthropic/claude-sonnet-5",
  "gemini-2-5-flash": "google/gemini-2.5-flash",
  "gemini-2-5-pro": "google/gemini-2.5-pro",
  "gemini-3-1-pro": "google/gemini-3.1-pro",
  "gpt-4-1": "openai/gpt-4.1",
  // "claude-fable-5": "anthropic/claude-fable-5",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-5-4": "openai/gpt-5.4",
  "gpt-5-5": "openai/gpt-5.5",
} as const;

export type ModelKey = keyof typeof MODELS;

export type ReasoningEffort = "automatic" | "low" | "medium" | "high";

const EFFORTS: ReasoningEffort[] = ["automatic", "low", "medium", "high"];

/**
 * What the model picker shows. Reasoning effort is only offered where the
 * provider accepts it together with structured output, which every AI step
 * here uses. Claude models think on their own, so they stay on "automatic".
 */
export const MODEL_INFO: Record<
  ModelKey,
  { displayName: string; provider: string; reasoningEfforts: ReasoningEffort[] }
> = {
  "claude-haiku-4-5": {
    displayName: "Claude Haiku 4.5",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
  "claude-opus-4-8": {
    displayName: "Claude Opus 4.8",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
  "claude-sonnet-4-6": {
    displayName: "Claude Sonnet 4.6",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
  "claude-sonnet-5": {
    displayName: "Claude Sonnet 5",
    provider: "Anthropic",
    reasoningEfforts: ["automatic"],
  },
  "gemini-2-5-flash": {
    displayName: "Gemini 2.5 Flash",
    provider: "Google",
    reasoningEfforts: EFFORTS,
  },
  "gemini-2-5-pro": {
    displayName: "Gemini 2.5 Pro",
    provider: "Google",
    reasoningEfforts: EFFORTS,
  },
  "gemini-3-1-pro": {
    displayName: "Gemini 3.1 Pro",
    provider: "Google",
    reasoningEfforts: ["automatic"],
  },
  "gpt-4-1": {
    displayName: "GPT-4.1",
    provider: "OpenAI",
    reasoningEfforts: ["automatic"],
  },
  "gpt-4o-mini": {
    displayName: "GPT-4o mini",
    provider: "OpenAI",
    reasoningEfforts: ["automatic"],
  },
  "gpt-5-4": {
    displayName: "GPT-5.4",
    provider: "OpenAI",
    reasoningEfforts: EFFORTS,
  },
  "gpt-5-5": {
    displayName: "GPT-5.5",
    provider: "OpenAI",
    reasoningEfforts: EFFORTS,
  },
};
