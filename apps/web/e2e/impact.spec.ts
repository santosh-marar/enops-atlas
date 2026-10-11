import { expect, test } from "@playwright/test";

test("a table shows what depends on it and offers no delete", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator(".cm-content")
    .fill(
      "Table users {\n id int [pk]\n}\nTable posts {\n id int [pk]\n user_id int [ref: > users.id]\n}"
    );
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);

  await page
    .getByRole("button", { name: "What depends on table users" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("What depends on table public.users?");
  await expect(dialog).toContainText("public.posts");
  await expect(dialog.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await dialog
    .getByRole("button", { exact: true, name: "Close" })
    .first()
    .click();
  await expect(dialog).toBeHidden();
});
