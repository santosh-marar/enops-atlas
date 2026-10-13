import type {
  ClarificationRound,
  TaskPlan,
} from "@enops/atlas-schema-intelligence";
import type {
  SchemaModel,
  SchemaModelRequest,
} from "@enops/atlas-schema-intelligence/ai";
import { scoreDbml } from "../quality";
import { type EditStep, planEdit } from "./edit-workflow";
import { generateFromPlan, type Proposal } from "./schema-flow";

/** Thrown when the user pressed Stop. */
export class StoppedError extends Error {
  constructor() {
    super("Stopped");
    this.name = "StoppedError";
  }
}

export const isStopped = (error: unknown) =>
  error instanceof StoppedError ||
  (error instanceof Error && error.name === "AbortError");

/**
 * Wraps a model so a stop takes effect at once, even if the request underneath
 * cannot be cancelled: the answer is dropped and nothing further is asked.
 */
export function stoppable(
  model: SchemaModel,
  signal: AbortSignal,
  onCall?: (call: { attempt: number }) => void
): SchemaModel {
  let attempt = 0;
  return {
    generateObject: async <T>(request: SchemaModelRequest<T>) => {
      if (signal.aborted) throw new StoppedError();
      attempt += 1;
      onCall?.({ attempt });
      const stopped = new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new StoppedError()), {
          once: true,
        });
      });
      const result = await Promise.race([
        model.generateObject(request),
        stopped,
      ]);
      if (signal.aborted) throw new StoppedError();
      return result;
    },
  };
}

interface RunInput {
  dbml: string;
  model: SchemaModel;
  onProgress: (step: string, detail?: string) => void;
  signal: AbortSignal;
}

/** Step 1: understand the request and plan it. Nothing is changed. */
export function runPlan(
  input: RunInput & {
    message: string;
    rounds: ClarificationRound[];
    techStack: Record<string, string | null> | null;
  }
): Promise<EditStep> {
  return planEdit({
    dbml: input.dbml,
    history: input.rounds,
    message: input.message,
    model: stoppable(input.model, input.signal),
    onProgress: input.onProgress,
    techStack: input.techStack,
  });
}

/**
 * Step 2: write the schema from the approved plan. The package checks it and
 * retries when it is invalid; each retry is reported as a step.
 */
export async function runGenerate(
  input: RunInput & { plan: TaskPlan; retrievedContext: string }
): Promise<Proposal> {
  const names = input.plan.tables.map((table) => table.name);
  const quality = input.plan.goal === "quality";
  const before = quality ? scoreDbml(input.dbml) : null;
  input.onProgress(
    quality
      ? `Fixing ${input.plan.decisions.length} quality hints`
      : names.length === 0
        ? "Writing the schema"
        : `Writing ${names.length} table${names.length === 1 ? "" : "s"}: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`
  );
  if (before) {
    input.onProgress("", `Quality is ${before.percent}% now. Aiming for 100%.`);
  }
  const proposal = await generateFromPlan({
    dbml: input.dbml,
    model: stoppable(input.model, input.signal, ({ attempt }) => {
      if (attempt > 1) {
        input.onProgress(
          quality
            ? `Another pass on the hints that are left (pass ${attempt})`
            : `Checking and fixing the schema (try ${attempt})`
        );
      }
    }),
    plan: input.plan,
    retrievedContext: input.retrievedContext,
  });
  const after = before ? scoreDbml(proposal.dbml) : null;
  if (before && after) {
    input.onProgress(
      "",
      `Quality went from ${before.percent}% to ${after.percent}%${after.issues.length > 0 ? `, ${after.issues.length} hint${after.issues.length === 1 ? "" : "s"} left` : ""}.`
    );
  }
  return proposal;
}
