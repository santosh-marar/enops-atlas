import type {
  ClarificationRound,
  TaskPlan,
} from "@enops/atlas-schema-intelligence";
import type {
  SchemaModel,
  SchemaModelRequest,
} from "@enops/atlas-schema-intelligence/ai";
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
  onProgress: (step: string) => void;
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
export function runGenerate(
  input: RunInput & { plan: TaskPlan; retrievedContext: string }
): Promise<Proposal> {
  input.onProgress("Writing the schema");
  return generateFromPlan({
    dbml: input.dbml,
    model: stoppable(input.model, input.signal, ({ attempt }) => {
      if (attempt > 1) {
        input.onProgress(`Fixing problems it found (attempt ${attempt})`);
      }
    }),
    plan: input.plan,
    retrievedContext: input.retrievedContext,
  });
}
