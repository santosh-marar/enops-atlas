import type {
  SchemaModel,
  SchemaModelRequest,
} from "@enops/atlas-schema-intelligence/ai";
import { generateObject } from "ai";
import {
  providerOptionsFor,
  type ReasoningEffort,
  reasoningFor,
} from "./execution-policy";
import type { ModelKey } from "./model-registory";
import { resolveModel } from "./provider";

export interface SchemaModelOptions {
  /** Model for the quick steps (intent, which table). Defaults to the main one. */
  fastModelKey?: ModelKey;
  /** The SDK's own retries for network errors and rate limits. */
  maxRetries?: number;
  /** Called for each request, so the chat can show what is happening. */
  onCall?: (call: {
    attempt: number;
    modelKey: ModelKey;
    tier: "capable" | "fast";
  }) => void;
  reasoningEffort?: ReasoningEffort;
  /** Aborting stops the request that is in flight. */
  signal?: AbortSignal;
}

/**
 * Lets the package's AI pipeline talk to the user's own model. The key is only
 * passed to the gateway for this request: it is never stored here or logged.
 */
export const schemaModel = (
  modelKey: ModelKey,
  apiKey: string,
  options: SchemaModelOptions = {}
): SchemaModel => {
  let attempt = 0;
  return {
    generateObject: async <T>(request: SchemaModelRequest<T>) => {
      const tier = request.tier === "fast" ? "fast" : "capable";
      const key =
        tier === "fast" ? (options.fastModelKey ?? modelKey) : modelKey;
      attempt += 1;
      options.onCall?.({ attempt, modelKey: key, tier });

      // The SDK takes either a prompt or messages, not both.
      const input = request.messages
        ? { messages: request.messages }
        : { prompt: request.prompt ?? "" };
      const run = (reasoning: ReturnType<typeof reasoningFor>) =>
        generateObject({
          ...input,
          abortSignal: options.signal,
          maxOutputTokens: request.maxOutputTokens,
          maxRetries: options.maxRetries ?? 2,
          model: resolveModel(key, apiKey),
          providerOptions: providerOptionsFor(key) as never,
          reasoning,
          schema: request.schema,
          system: request.system,
        });

      // Reasoning effort only applies to the capable steps.
      const reasoning =
        tier === "capable"
          ? reasoningFor(key, options.reasoningEffort ?? "automatic")
          : undefined;
      try {
        const { object } = await run(reasoning);
        return { object: object as T };
      } catch (error) {
        // A model that rejects the reasoning setting still gets answered.
        if (!reasoning || options.signal?.aborted) throw error;
        const { object } = await run(undefined);
        return { object: object as T };
      }
    },
  };
};
