import type { ClarificationRound } from "./types";

/**
 * Turns the original message plus any prior clarification rounds into one
 * explicitly labeled block. Every LLM call is stateless — this is what lets
 * a resumed call "know" what was asked and answered, instead of guessing
 * from naively concatenated text.
 */
export function buildTranscript(
  originalMessage: string,
  history: ClarificationRound[]
): string {
  if (history.length === 0) return originalMessage;

  const rounds = history
    .map(
      (round, i) =>
        `Clarifying question ${i + 1}: ${round.question}\nUser's answer ${i + 1}: ${round.answer}`
    )
    .join("\n\n");

  return `Original request: ${originalMessage}\n\n${rounds}`;
}
