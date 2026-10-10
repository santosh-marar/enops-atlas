import type { z } from "zod";

export type SchemaModelMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SchemaModelRequest<T> = {
  maxOutputTokens: number;
  messages?: SchemaModelMessage[];
  /**
   * Optional provider-specific model key. Runtime-neutral: each host maps it
   * to its own model registry. Absent means "use the tier default".
   */
  modelKey?: string;
  prompt?: string;
  /** Optional native model thinking effort; hosts may ignore unsupported levels. */
  reasoningEffort?: "automatic" | "low" | "medium" | "high";
  schema: z.ZodType<T>;
  system: string;
  tier?: "fast" | "capable";
};

/** Runtime boundary: the host app implements this with its own AI provider. */
export interface SchemaModel {
  generateObject: <T>(request: SchemaModelRequest<T>) => Promise<{ object: T }>;
}
