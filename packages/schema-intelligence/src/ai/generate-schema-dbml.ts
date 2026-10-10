import { SchemaGraphEngine as SchemaGraph } from "@enops/atlas-graph";
import type { CanonicalSchema, NormalizedSchema } from "@enops/atlas-schema";
import {
  type NormalizeError,
  normalize,
  parseDbml,
  renderDbml,
} from "@enops/atlas-schema";
import { z } from "zod";
import { type SchemaConfidence, scoreSchema } from "../confidence/score";
import type { SchemaModel } from "../model";
import {
  checkDirectionSanity,
  type DirectionSanityResult,
} from "../validator/direction-sanity";
import { type ValidationIssue, validate } from "../validator/validator";

const DbmlOutputSchema = z.object({
  dbml: z
    .string()
    .describe(
      "Complete DBML source. No markdown fences, no commentary — DBML syntax only."
    ),
});

// parseDbmlSafely
interface ParseResult {
  parseErrors: string[];
  schema: NormalizedSchema | null;
}

function parseDbmlSafely(dbmlText: string): ParseResult {
  try {
    const result = parseDbml(dbmlText) as unknown as {
      schema?: NormalizedSchema;
      errors?: Array<{ message: string }>;
    };
    if (result && "schema" in result) {
      return {
        parseErrors: (result.errors ?? []).map((e) => e.message),
        schema: result.schema ?? null,
      };
    }
    return { parseErrors: [], schema: result as unknown as NormalizedSchema };
  } catch (err) {
    return {
      parseErrors: [err instanceof Error ? err.message : String(err)],
      schema: null,
    };
  }
}

export interface GenerateSchemaDbmlResult {
  attempts: number;
  canonical: CanonicalSchema | null;
  confidence: SchemaConfidence | null;
  dbml: string;
  directionSanity: DirectionSanityResult | null;
  issues: ValidationIssue[];
  normalized: NormalizedSchema | null;
  normalizeErrors: NormalizeError[];
  parseErrors: string[];
  parseFailed: boolean;
  valid: boolean;
}

/**
 * The ONE generation engine: LLM → parse → validate → retry → normalize →
 * sanity-check → confidence-score. The plan builder and the executor each
 * assemble their own prompts; the generate/validate/sanity discipline lives
 * here and nowhere else.
 *
 * Retry discipline: on a parse failure or validation error the broken DBML
 * is fed back conversationally with ONLY the errors listed — the model fixes
 * what's broken and keeps everything else the same.
 */
export async function generateDbmlPipeline(params: {
  model: SchemaModel;
  system: string;
  prompt: string;
  maxRetries?: number;
  maxOutputTokens?: number;
}): Promise<GenerateSchemaDbmlResult> {
  const { maxRetries = 3 } = params;

  let messages: { role: "user" | "assistant"; content: string }[] = [
    { content: params.prompt, role: "user" },
  ];
  let attempts = 0;

  while (true) {
    attempts += 1;

    // Sequential by design: each retry must see the previous attempt's
    // output and errors to fix ONLY what's broken.
    // biome-ignore lint/performance/noAwaitInLoops: deliberate retry loop
    const { object } = await params.model.generateObject({
      maxOutputTokens: params.maxOutputTokens ?? 16_000,
      messages,
      schema: DbmlOutputSchema,
      system: params.system,
      tier: "capable",
    });

    const { schema: normalized, parseErrors } = parseDbmlSafely(object.dbml);

    if (!normalized) {
      if (attempts <= maxRetries) {
        messages = [
          ...messages,
          { content: object.dbml, role: "assistant" as const },
          {
            content: `That DBML failed to parse. Fix ONLY the syntax errors, keep everything else the same:\n${parseErrors.join("\n")}`,
            role: "user" as const,
          },
        ];
        continue;
      }
      return {
        attempts,
        canonical: null,
        confidence: null,
        dbml: object.dbml,
        directionSanity: null,
        issues: [],
        normalized: null,
        normalizeErrors: [],
        parseErrors,
        parseFailed: true,
        valid: false,
      };
    }

    const graph = new SchemaGraph(normalized);
    const result = validate(normalized, graph);

    if (!result.valid && attempts <= maxRetries) {
      const errorSummary = result.errors
        .map((e) => `- [${e.code}] ${e.message}`)
        .join("\n");
      messages = [
        ...messages,
        { content: object.dbml, role: "assistant" as const },
        {
          content: `That schema has validation errors. Fix ONLY what is broken, keep everything else the same:\n${errorSummary}`,
          role: "user" as const,
        },
      ];
      continue;
    }

    const { schema: canonical, errors: normalizeErrors } =
      normalize(normalized);
    const dbml = renderDbml(canonical);
    const directionSanity = checkDirectionSanity(normalized);
    const confidence = scoreSchema(canonical);

    return {
      attempts,
      canonical,
      confidence,
      dbml,
      directionSanity,
      issues: result.issues,
      normalized,
      normalizeErrors,
      parseErrors: [],
      parseFailed: false,
      valid: result.valid && normalizeErrors.length === 0,
    };
  }
}
