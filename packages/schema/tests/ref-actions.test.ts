import { describe, expect, test } from "bun:test";
import { parseDbml } from "../src";

describe("referential actions", () => {
  test("any letter case is read as the lowercase action", () => {
    const parsed = parseDbml(`
Table a { id int [pk] }
Table b {
  id int [pk]
  a_id int
}
Ref: b.a_id > a.id [delete: CASCADE, update: Set Null]
`);
    expect(parsed.relationships[0]?.onDelete).toBe("cascade");
    expect(parsed.relationships[0]?.onUpdate).toBe("set null");
  });

  test("no action written means none", () => {
    const parsed = parseDbml(`
Table a { id int [pk] }
Table b {
  id int [pk]
  a_id int [ref: > a.id]
}
`);
    expect(parsed.relationships[0]?.onDelete).toBe("none");
  });
});
