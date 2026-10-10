import type {
  SchemaModel,
  SchemaModelRequest,
} from "@enops/atlas-schema-intelligence/ai";
import { generateObject } from "ai";
import type { ModelKey } from "./model-registory";
import { resolveModel } from "./provider";

/**
 * Lets the package's AI pipeline talk to the user's own model. The key is only
 * passed to the gateway for this request: it is never stored here or logged.
 */
export const schemaModel = (
  modelKey: ModelKey,
  apiKey: string
): SchemaModel => ({
  generateObject: async <T>(request: SchemaModelRequest<T>) => {
    // The SDK takes either a prompt or messages, not both.
    const input = request.messages
      ? { messages: request.messages }
      : { prompt: request.prompt ?? "" };
    const { object } = await generateObject({
      ...input,
      maxOutputTokens: request.maxOutputTokens,
      model: resolveModel(modelKey, apiKey),
      schema: request.schema,
      system: request.system,
    });
    return { object: object as T };
  },
});
