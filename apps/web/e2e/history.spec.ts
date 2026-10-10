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

  await page.getByRole("button", { exact: true, name: "History" }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Save version" });
  await save.click();
  await expect
    .poll(async () => (await readStore(page, "versions")).length)
    .toBe(1);
  // saving again without a change adds nothing
  await save.click();
  await page.waitForTimeout(500);
  expect(await readStore(page, "versions")).toHaveLength(1);
  await page.keyboard.press("Escape");

  await editSchema(page, "version_two");
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await page.getByRole("button", { exact: true, name: "History" }).click();
  await dialog.getByRole("button", { name: "Save version" }).click();
  await expect
    .poll(async () => (await readStore(page, "versions")).length)
    .toBe(2);
  await expect(dialog).toContainText("public.version_two");
  await expect(dialog).toContainText("Tables removed");
});
