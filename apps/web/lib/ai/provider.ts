import type { LanguageModel } from "ai";
import { createGateway } from "ai";
import type { ModelKey } from "./model-registory";

export function resolveModel(
  modelKey: ModelKey,
  apiKey: string
): LanguageModel {
  if (!modelKey) throw new Error("Select an AI model");
  if (!apiKey.trim()) throw new Error("Configure an AI Gateway key");
  // Providers belong to the current request; credential changes take effect immediately.
  return createGateway({ apiKey: apiKey.trim() })(modelKey);
}
