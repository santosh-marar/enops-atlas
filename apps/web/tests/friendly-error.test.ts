import { expect, test } from "bun:test";
import { friendlyError } from "../lib/ai/friendly-error";

test("an unreadable model reply never reaches the user as a parsing error", () => {
  for (const message of [
    "No object generated: could not parse the response.",
    "JSON parsing failed: Unexpected token",
    "Type validation failed: Value did not match schema",
  ]) {
    const text = friendlyError(new Error(message));
    expect(text).not.toMatch(/object generated|json|parse/i);
    expect(text).toContain("Nothing was changed");
  }
});

test("other failures say what to do, and unknown ones keep their own message", () => {
  expect(friendlyError(new Error("Configure an AI Gateway key"))).toContain(
    "AI Settings"
  );
  expect(friendlyError(new Error("429 Too Many Requests"))).toContain("busy");
  expect(friendlyError(new Error("Select an AI model"))).toBe(
    "Select an AI model"
  );
  expect(friendlyError("odd")).toContain("Something went wrong");
});
