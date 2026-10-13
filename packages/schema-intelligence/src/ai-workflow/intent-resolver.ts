import { z } from "zod";
import type { SchemaModel } from "../model";
import { isQualityRequest } from "./quality-goal";
import type { IntentResolverOutput } from "./types";

const IntentSchema = z.object({
  intentConfidence: z.number().min(0).max(1),
  intentType: z.enum([
    "generate",
    "modify",
    "add",
    "remove",
    "rename",
    "inspect",
    "validate",
    // "migrate" deliberately excluded for now — deferred, not yet handled
    // downstream. Re-add here once Task Planner/Executor support it.
    "unknown",
  ]),
});

const SYSTEM_PROMPT = `You classify a developer's request about a database schema into exactly one intent type.

Intent types:
- generate: create a brand new schema from requirements
- modify: change an existing schema in a general way
- add: add a table, column, index, constraint, or relation
- remove: remove a table, column, index, constraint, or relation
- rename: rename a table, column, index, or similar
- inspect: explain or analyze the existing schema
- validate: check schema correctness or find problems
- unknown: doesn't fit any of the above, is too vague to classify, or is a migration request (not yet supported — classify as unknown)

Do NOT extract entity names or assess whether the request has enough detail — those happen in separate stages. Only classify intent.

Respond with ONLY a JSON object, no other text:
{"intentType": "...", "intentConfidence": 0.0-1.0}`;

export async function resolveIntent(
  query: string,
  model: SchemaModel
): Promise<IntentResolverOutput> {
  // "Make it production ready" is a change to the whole schema; no model needed.
  if (isQualityRequest(query)) {
    return { intentConfidence: 1, intentType: "modify" };
  }
  const { object } = await model.generateObject({
    maxOutputTokens: 200,
    prompt: query,
    schema: IntentSchema,
    system: SYSTEM_PROMPT,
    tier: "fast",
  });
  return object;
}
