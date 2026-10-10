import { expect, test } from "bun:test";
import { normalize, parseDbml } from "@enops/atlas-schema";
import { generatePrismaSchema } from "../src/prisma";

const prismaFor = (dbml: string) =>
  generatePrismaSchema(normalize(parseDbml(dbml)).schema);

test("a relation field is named after its foreign key column", () => {
  const prisma = prismaFor(`
Table teams { id int [pk] }
Table users {
  id int [pk]
  team_id int [ref: > teams.id]
}
`);
  expect(prisma).toMatch(/\n {2}team Teams\? @relation\(fields: \[teamId\]/);
  expect(prisma).toMatch(/\n {2}users Users\[\] @relation/);
  expect(prisma).not.toContain("relation_");
  expect(prisma).not.toContain("related_");
});

test("a self reference and a second key to the same table stay distinct", () => {
  const prisma = prismaFor(`
Table teams { id int [pk] }
Table users {
  id int [pk]
  manager_id int [ref: > users.id]
  team_id int [ref: > teams.id]
  backup_team_id int [ref: > teams.id]
}
`);
  expect(prisma).toContain("manager Users?");
  expect(prisma).toContain("usersManager Users[]");
  expect(prisma).toContain("team Teams?");
  expect(prisma).toContain("backupTeam Teams?");
  expect(prisma).toContain("usersTeam Users[]");
  expect(prisma).toContain("usersBackupTeam Users[]");
});
