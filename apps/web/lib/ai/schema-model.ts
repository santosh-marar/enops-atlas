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

/** The model answered, but not with usable JSON: cut off, wrapped in prose, or malformed. */
const BAD_OUTPUT = new Set([
  "AI_NoObjectGeneratedError",
  "AI_JSONParseError",
  "AI_TypeValidationError",
]);
export const isBadOutput = (error: unknown) =>
  error instanceof Error &&
  (BAD_OUTPUT.has(error.name) || /could not parse|JSON/i.test(error.message));

/** How many times a reply that is not valid JSON is asked for again. */
const BAD_OUTPUT_RETRIES = 2;
const MAX_OUTPUT_TOKENS = 32_000;

/** Pulls the JSON object out of a reply wrapped in a code fence or in prose. */
export function extractJson(text: string): string | null {
  const unfenced = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const candidate = unfenced.slice(start, end + 1);
  return candidate === text ? null : candidate;
}

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
      const run = (
        reasoning: ReturnType<typeof reasoningFor>,
        maxOutputTokens: number | undefined
      ) =>
        generateObject({
          ...input,
          abortSignal: options.signal,
          maxOutputTokens,
          maxRetries: options.maxRetries ?? 2,
          model: resolveModel(key, apiKey),
          providerOptions: providerOptionsFor(key) as never,
          reasoning,
          repairText: async ({ text }: { text: string }) => extractJson(text),
          schema: request.schema,
          system: request.system,
        });

      // Reasoning effort only applies to the capable steps.
      let reasoning =
        tier === "capable"
          ? reasoningFor(key, options.reasoningEffort ?? "automatic")
          : undefined;
      let maxOutputTokens = request.maxOutputTokens;
      for (let tries = 0; ; tries += 1) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: each try must wait for the last
          const { object } = await run(reasoning, maxOutputTokens);
          return { object: object as T };
        } catch (error) {
          if (options.signal?.aborted) throw error;
          if (isBadOutput(error) && tries < BAD_OUTPUT_RETRIES) {
            // Asked again: a reply cut off for length gets more room.
            if (
              (error as { finishReason?: string }).finishReason === "length"
            ) {
              maxOutputTokens = Math.min(
                MAX_OUTPUT_TOKENS,
                Math.round((maxOutputTokens ?? 8000) * 1.5)
              );
            }
            continue;
          }
          // A model that rejects the reasoning setting still gets answered.
          if (!reasoning) throw error;
          reasoning = undefined;
        }
      }
    },
  };
};
