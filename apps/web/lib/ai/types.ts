import type { ModelMessage, ToolSet } from "ai";
import type { ModelKey } from "./model-registory";

export type { ModelKey, ModelMessage };

export interface AIBaseOptions {
  /** Falls back to FEATURE_DEFAULTS[featureKey] if not set */
  maxOutputTokens?: number;
  messages: ModelMessage[];
  modelKey: ModelKey;
  system: string;
  /** Falls back to FEATURE_DEFAULTS[featureKey] if not set */
  temperature?: number;
  toolChoice?: "auto" | "none" | "required";
  tools?: ToolSet;
}

// projectId & conversationId
