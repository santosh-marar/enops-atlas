export const MODELS = {
  "claude-haiku-4-5": "anthropic/claude-haiku-4-5",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4-6",
  "claude-opus-4-8": "anthropic/claude-opus-4-8",
  // "claude-fable-5": "anthropic/claude-fable-5",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4-1": "openai/gpt-4.1",
  "gpt-5-4": "openai/gpt-5.4",
  "gpt-5-5": "openai/gpt-5.5",
  "gemini-2-5-flash": "google/gemini-2.5-flash",
  "gemini-2-5-pro": "google/gemini-2.5-pro",
  "gemini-3-1-pro": "google/gemini-3.1-pro",
} as const;

export type ModelKey = keyof typeof MODELS;
