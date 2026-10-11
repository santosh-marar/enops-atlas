import { describe, expect, test } from "bun:test";
import type { TaskPlan } from "../ai-workflow/types";
import { assessAtlasProposal } from "../atlas-guardrails";

const users = "Table users {\n id integer [pk]\n email text\n}";
const posts = "Table posts {\n id integer [pk]\n user_id integer\n}";
const baseline = `${users}\n${posts}`;
const plan = (
  names: string[],
  operationType: TaskPlan["operationType"] = "modify"
): TaskPlan => ({
  decisions: [],
  entityName: null,
  generationPrompt: "",
  id: "plan",
  operationType,
  originalPrompt: "add a user field",
  tables: names.map((name) => ({ isNew: false, name })),
});

describe("Atlas proposal scope and preservation", () => {
  test("allows an additive edit within the planned table", () => {
    const result = assessAtlasProposal(
      baseline,
      baseline.replace("email text", "email text\n name text"),
      plan(["users"])
    );
    expect(result.digest).toHaveLength(64);
    expect(result.changes).toContainEqual({
      change: "added",
      object: "field public.users name",
      reviewRequired: false,
    });
  });
  test("rejects dropped or edited unrelated tables even if output is valid", () => {
    expect(() => assessAtlasProposal(baseline, users, plan(["users"]))).toThrow(
      "outside the planned"
    );
    expect(() =>
      assessAtlasProposal(
        baseline,
        baseline.replace("user_id integer", "user_id text"),
        plan(["users"])
      )
    ).toThrow("outside the planned");
  });
  test("rejects unplanned relationship changes", () => {
    expect(() =>
      assessAtlasProposal(
        baseline,
        baseline + "\nRef: posts.user_id > users.id",
        plan(["users"])
      )
    ).toThrow("relationship outside");
    expect(
      assessAtlasProposal(
        baseline,
        baseline + "\nRef: posts.user_id > users.id",
        plan(["posts"])
      ).digest
    ).toHaveLength(64);
  });
  test("flags destructive edits and required fields without defaults for review", () => {
    expect(
      assessAtlasProposal(
        baseline,
        baseline.replace(" email text\n", ""),
        plan(["users"])
      ).risks
    ).toContain("removed: field public.users email");
    expect(
      assessAtlasProposal(
        baseline,
        baseline.replace("email text", "email text\n name text [not null]"),
        plan(["users"])
      ).risks.some((r) => r.includes("without a default"))
    ).toBe(true);
  });
  test("cannot mutate a read-only plan or write redacted secrets", () => {
    expect(() =>
      assessAtlasProposal(baseline, baseline, plan(["users"], "inspect"))
    ).toThrow("read-only");
    expect(() =>
      assessAtlasProposal(
        baseline,
        baseline.replace(
          "email text",
          "email text [note: '[REDACTED:secret]']"
        ),
        plan(["users"])
      )
    ).toThrow("credentials");
  });
  test("rejects dialect changes and ambiguous table targets", () => {
    expect(() =>
      assessAtlasProposal(
        "Project app {\n database_type: 'PostgreSQL'\n}\n" + baseline,
        "Project app {\n database_type: 'MySQL'\n}\n" + baseline,
        plan(["users"])
      )
    ).toThrow("dialect");
    const ambiguous = users + "\nTable other.users {\n id integer [pk]\n}";
    expect(() =>
      assessAtlasProposal(ambiguous, ambiguous, plan(["users"]))
    ).toThrow("ambiguous");
  });
  test("rejects global enum changes affecting unplanned tables", () => {
    const before =
      "Enum state {\n active\n disabled\n}\n" +
      baseline
        .replace("email text", "email state")
        .replace("user_id integer", "user_id integer\n status state");
    expect(() =>
      assessAtlasProposal(
        before,
        before.replace(" disabled", " inactive"),
        plan(["users"])
      )
    ).toThrow("enum");
  });
});
