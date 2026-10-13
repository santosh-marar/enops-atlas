import type { ModelMessage, ToolSet } from "ai";
import type { ModelKey, ReasoningEffort } from "./model-registory";

export type { ModelKey, ModelMessage };

export interface AIBaseOptions {
  abortSignal?: AbortSignal;
  /** Falls back to FEATURE_DEFAULTS[featureKey] if not set */
  maxOutputTokens?: number;
  messages: ModelMessage[];
  modelKey: ModelKey;
  /** The SDK's reasoning level; undefined leaves it to the model. */
  reasoning?: Exclude<ReasoningEffort, "automatic">;
  system: string;
  /** Falls back to FEATURE_DEFAULTS[featureKey] if not set */
  temperature?: number;
  toolChoice?: "auto" | "none" | "required";
  tools?: ToolSet;
}

// projectId & conversationId
