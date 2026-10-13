import { describe, expect, test } from "bun:test";
import {
  attachmentProblem,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  readAttachments,
  toAttachment,
} from "../lib/chat-attachments";

const file = (name: string, contents: string, type = "") =>
  new File([contents], name, { type });

describe("chat attachments", () => {
  test("accepts schema and text files", () => {
    for (const name of [
      "schema.dbml",
      "dump.SQL",
      "schema.prisma",
      "schema.ts",
      "sample.json",
      "openapi.yaml",
      "users.csv",
      "notes.md",
      "brief.txt",
    ]) {
      expect(attachmentProblem({ name, size: 10, type: "" })).toBeNull();
    }
  });

  test("refuses images, unknown types and large files", () => {
    expect(
      attachmentProblem({ name: "erd.png", size: 10, type: "image/png" })
    ).toContain("images aren't supported");
    expect(
      attachmentProblem({ name: "app.exe", size: 10, type: "" })
    ).toContain("use DBML");
    expect(
      attachmentProblem({ name: "Makefile", size: 10, type: "" })
    ).toContain("use DBML");
    expect(
      attachmentProblem({
        name: "big.sql",
        size: MAX_ATTACHMENT_BYTES + 1,
        type: "",
      })
    ).toContain("larger than");
  });

  test("labels and fences the contents for the model", () => {
    expect(toAttachment("schema.sql", "CREATE TABLE a (id int);\n\n")).toEqual({
      lineCount: 1,
      name: "schema.sql",
      text: "File: schema.sql\n```sql\nCREATE TABLE a (id int);\n```",
    });
  });

  test("reads good files and reports the rest", async () => {
    const { attachments, problems } = await readAttachments(
      [
        file("schema.dbml", "Table users {\n  id int\n}"),
        file("logo.png", "png", "image/png"),
        file("blank.sql", "  \n"),
        file("renamed.json", "a\u0000b"),
      ],
      0
    );
    expect(attachments.map((item) => item.name)).toEqual(["schema.dbml"]);
    expect(attachments[0]?.lineCount).toBe(3);
    expect(problems).toHaveLength(3);
  });

  test("stops at the attachment limit", async () => {
    const { attachments, problems } = await readAttachments(
      [file("a.sql", "x"), file("b.sql", "y")],
      MAX_ATTACHMENTS - 1
    );
    expect(attachments).toHaveLength(1);
    expect(problems).toEqual([
      `Attach up to ${MAX_ATTACHMENTS} files at a time.`,
    ]);
  });
});
