import type { LanguageModel } from "ai";
import { createGateway } from "ai";
import type { ModelKey } from "./model-registory";

let _gateway: ReturnType<typeof createGateway> | null = null;

function getGateway(apiKey: string) {
  if (!_gateway) {
    _gateway = createGateway({ apiKey });
  }
  return _gateway;
}

export function resolveModel(
  modelKey: ModelKey,
  apiKey: string
): LanguageModel {
  const id = modelKey;
  if (!id) throw new Error(`No gateway mapping for modelKey: ${modelKey}`);
  return getGateway(apiKey)(id);
}
