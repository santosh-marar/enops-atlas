import { describe, expect, test } from "bun:test";
import { drizzleToDbml } from "../adapters/drizzle/to-dbml";

describe("drizzle adapter: app-level column features", () => {
  test("ignores runtime hooks, keeps TS enums as notes, reads sql defaults", () => {
    const { dbml } = drizzleToDbml([
      {
        content: [
          'import { pgTable, text, timestamp } from "drizzle-orm/pg-core";',
          'import { sql } from "drizzle-orm";',
          'export const comment = pgTable("comment", {',
          '  id: text("id").primaryKey(),',
          '  kind: text("kind", { enum: ["note", "reply"] }).notNull(),',
          '  createdAt: timestamp("created_at").default(sql`now()`),',
          '  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),',
          '  slug: text("slug").$defaultFn(() => "x"),',
          "});",
        ].join("\n"),
        path: "schema/comment.ts",
      },
    ]);
    expect(dbml).toContain(
      '"kind" text [note: "one of: note, reply", not null]'
    );
    expect(dbml).toContain("default: `now()`");
    expect(dbml).toContain('"updated_at" timestamp');
    expect(dbml).toContain('"slug" text');
  });
});
