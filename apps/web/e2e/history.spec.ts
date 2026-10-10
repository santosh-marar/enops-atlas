import { expect, type Page, test } from "@playwright/test";

const readStore = (page: Page, store: "projects" | "versions") =>
  page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("EnopsDevDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = database
          .transaction(name, "readonly")
          .objectStore(name)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, store);

async function editSchema(page: Page, name: string) {
  await page.locator(".cm-content").fill(`Table ${name} {\n id int [pk]\n}`);
  await expect(page.locator(".react-flow__node").first()).toContainText(name);
}

test("history keeps one version per real change and shows what changed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await editSchema(page, "version_one");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect
    .poll(async () => (await readStore(page, "projects")).length)
    .toBe(1);

  const dialog = page.getByRole("dialog");
  const saveVersion = async (description?: string) => {
    await page.getByRole("button", { name: "New version" }).click();
    if (description) await dialog.getByRole("textbox").fill(description);
    await dialog.getByRole("button", { name: "Save Version" }).click();
    await expect(dialog).toBeHidden();
  };

  await saveVersion("first draft");
  await expect
    .poll(async () => (await readStore(page, "versions")).length)
    .toBe(1);
  // saving again without a change adds nothing
  await saveVersion();
  await page.waitForTimeout(500);
  expect(await readStore(page, "versions")).toHaveLength(1);

  await editSchema(page, "version_two");
  await saveVersion("renamed table");
  await expect
    .poll(async () => (await readStore(page, "versions")).length)
    .toBe(2);

  await page.getByRole("button", { exact: true, name: "History" }).click();
  await expect(dialog).toContainText("v2");
  await expect(dialog).toContainText("renamed table");
  await expect(dialog).toContainText("v1");
  await expect(dialog).toContainText("first draft");
  await expect(dialog).toContainText("public.version_two");
  await expect(dialog).toContainText("Tables removed");
});
