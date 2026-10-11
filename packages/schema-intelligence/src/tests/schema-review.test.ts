import { expect, test } from "bun:test";
import { chooseSchemaField } from "../schema-review";
import { schemaChanges, schemaSnapshot } from "../schema-snapshot";

const atlas = "Table users {\n id integer [pk]\n email text\n}";
const forge =
  "Table users {\n id integer [pk]\n role varchar(50) [default: 'user']\n}";
test("field choices combine fields without discarding unrelated definitions", () => {
  const merged = chooseSchemaField(atlas, forge, "public.users", "role");
  const { columns } = schemaSnapshot(merged).physical.tables[0]!;
  expect(columns.map((column) => column.name).sort()).toEqual([
    "email",
    "id",
    "role",
  ]);
  expect(columns.find((column) => column.name === "role")!.default?.value).toBe(
    "user"
  );
});
test("choosing an absent field removes only that field", () => {
  const merged = chooseSchemaField(atlas, forge, "public.users", "email");
  expect(
    schemaSnapshot(merged).physical.tables[0]!.columns.map(
      (column) => column.name
    )
  ).toEqual(["id"]);
});
test("a field choice cannot silently remove a referenced primary key", () => {
  expect(() =>
    chooseSchemaField(
      atlas,
      "Table users {\n email text\n}",
      "public.users",
      "id"
    )
  ).toThrow();
});
test("required added fields warn, nullable additions do not, removals warn", () => {
  const base = "Table users {\n id integer [pk]\n}";
  expect(
    schemaChanges(base, atlas).changes.some((change) => change.reviewRequired)
  ).toBe(false);
  expect(
    schemaChanges(
      base,
      atlas.replace("email text", "email text [not null]")
    ).changes.some((change) => change.reviewRequired)
  ).toBe(true);
  expect(schemaChanges(atlas, base).changes).toContainEqual({
    change: "removed",
    object: "field public.users email",
    reviewRequired: true,
  });
});
