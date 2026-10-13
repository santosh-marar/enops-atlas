/**
 * What the chat says when a request fails. The raw message is for logs: "No
 * object generated" or a stack of provider text means nothing to the person
 * who asked for a schema change.
 */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (
    /could not parse|no object generated|json|type validation|did not match schema/i.test(
      message
    )
  ) {
    return "The model's answer could not be read this time, even after trying again. Nothing was changed. Try again, or switch to another model from the model menu.";
  }
  if (
    /api key|configure an ai gateway key|unauthorized|401|403/i.test(message)
  ) {
    return "The AI key was not accepted. Check it in AI Settings.";
  }
  if (/429|rate.?limit|quota|insufficient/i.test(message)) {
    return "The AI service is busy or out of quota. Wait a moment and try again.";
  }
  if (/timeout|timed out|fetch failed|network|econn/i.test(message)) {
    return "Could not reach the AI service. Check your connection and try again.";
  }
  return message || "Something went wrong. Nothing was changed.";
}
