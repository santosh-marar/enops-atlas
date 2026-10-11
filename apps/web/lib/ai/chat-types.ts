import type {
  ClarificationRound,
  TaskPlan,
} from "@enops/atlas-schema-intelligence";
import type { Proposal } from "./schema-flow";

/**
 * Where an assistant message is in the work. A message moves through these as
 * one conversation turn goes on, the same way it does in Enops Cloud.
 */
export type MessagePhase =
  | "WORKING"
  | "NEEDS_CLARIFICATION"
  | "NEEDS_APPROVAL"
  | "GENERATING"
  | "DONE"
  | "ANSWERED"
  | "STOPPED"
  | "ERROR";

export interface ThinkingStep {
  /** Epoch ms when the step started. */
  at: number;
  label: string;
}

/** What is needed to run a request again. */
export interface ChatRequest {
  message: string;
  rounds: ClarificationRound[];
}

export interface ChatMessage {
  /** Set once the user answers this question. */
  answeredValue?: string;
  /** The proposal was applied; the schema before it is the checkpoint. */
  applied?: boolean;
  /** Version number of the checkpoint saved before applying, if any. */
  checkpoint?: number | null;
  content: string;
  /** Epoch ms. */
  createdAt?: number;
  /** The proposal was discarded. */
  discarded?: boolean;
  /** Which step failed, so Retry knows where to start again. */
  failedStage?: "generate" | "plan";
  id: string;
  phase?: MessagePhase;
  plan?: TaskPlan;
  planMarkdown?: string;
  /** In plan mode nothing is written, so there is no Approve. */
  planOnly?: boolean;
  planStatus?: "approved" | "pending" | "rejected";
  /** The schema the proposal was made against; Apply refuses if it changed. */
  previousDbml?: string;
  proposal?: Proposal;
  question?: { options?: string[]; text: string };
  request?: ChatRequest;
  /** The checkpoint was restored. */
  restored?: boolean;
  retrievedContext?: string;
  role: "user" | "assistant";
  /** Earlier questions and answers of this request. */
  rounds?: ClarificationRound[];
  steps?: ThinkingStep[];
  /** How long the thinking took. */
  thinkingMs?: number;
}
