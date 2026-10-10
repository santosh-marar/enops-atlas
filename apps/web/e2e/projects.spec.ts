import { expect, type Page, test } from "@playwright/test";

const readProjects = (page: Page) =>
  page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("EnopsDevDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<
        Array<{ id: string; name: string; dbml: string }>
      >((resolve, reject) => {
        const request = database
          .transaction("projects", "readonly")
          .objectStore("projects")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  });
async function editSchema(page: Page, name: string) {
  const editor = page.locator(".cm-content");
  await editor.fill(`Table ${name} {\n id int [pk]\n}`);
  await expect(page.locator(".react-flow__node").first()).toContainText(name);
}
async function rename(page: Page, oldName: string, name: string) {
  await page.getByRole("button", { exact: true, name: oldName }).click();
  const input = page.locator('input[type="text"]:visible').first();
  await input.fill(name);
  await input.press("Enter");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect
    .poll(async () => (await readProjects(page)).some((p) => p.name === name))
    .toBe(true);
}

test("new, save, open, autosave and reload preserve independent projects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await editSchema(page, "first_table");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await rename(page, "Untitled Project", "First");
  const first = (await readProjects(page))[0]!;
  await page.getByTitle("New Project", { exact: true }).click();
  await page.getByRole("button", { exact: true, name: "Create New" }).click();
  await expect(page.locator(".cm-content")).toHaveText("");
  await editSchema(page, "second_table");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await rename(page, "Untitled Project", "Second");
  const projects = await readProjects(page);
  expect(projects).toHaveLength(2);
  expect(new Set(projects.map((p) => p.id)).size).toBe(2);
  expect(projects.find((p) => p.id === first.id)?.dbml).toContain(
    "first_table"
  );
  await page.getByTitle("Browse Projects", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /First/ }).click();
  await expect(page.locator(".cm-content")).toContainText("first_table");
  await page.clock.install();
  await editSchema(page, "first_updated");
  await page.clock.fastForward(31_000);
  await expect
    .poll(
      async () =>
        (await readProjects(page)).find((p) => p.id === first.id)?.dbml
    )
    .toContain("first_updated");
  expect(
    (await readProjects(page)).find((p) => p.name === "Second")?.dbml
  ).toContain("second_table");
  await page.reload();
  await expect(page.locator(".cm-content")).toContainText("first_updated");
});

test("saving rapidly does not allocate duplicate projects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await editSchema(page, "single_table");
  await page.getByRole("button", { exact: true, name: "Save" }).dblclick();
  await expect.poll(async () => (await readProjects(page)).length).toBe(1);
});

test("clearing a saved schema autosaves and remains empty after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await editSchema(page, "cleared_table");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect.poll(async () => (await readProjects(page)).length).toBe(1);
  await page.clock.install();
  await page.locator(".cm-content").fill("");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.clock.fastForward(31_000);
  await expect.poll(async () => (await readProjects(page))[0]?.dbml).toBe("");
  await page.reload();
  await expect(
    page.getByRole("button", { exact: true, name: "Untitled Project" })
  ).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveText("");
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
});
