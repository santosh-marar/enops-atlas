import { expect, type Page, test } from "@playwright/test";

const PROJECT_ID = "chat-project";
const SAVED = "Table users {\n  id int [pk]\n}";
const PROPOSED = `${SAVED}\n\nTable posts {\n  id int [pk]\n  user_id int [ref: > users.id]\n}`;

const TECH_STACK = {
  authLibrary: "none",
  backendFramework: "express",
  billingLibrary: "none",
  database: "postgresql",
  language: "typescript",
  orm: "prisma",
};

const PLAN = {
  decisions: [],
  entityName: null,
  generationPrompt: "",
  id: "p1",
  operationType: "modify",
  originalPrompt: "add posts",
  tables: [{ isNew: true, name: "posts" }],
};

const user = { content: "add a posts table", id: "u1", role: "user" };

const planMessage = {
  content: "Here is the plan.",
  id: "a1",
  phase: "NEEDS_APPROVAL",
  plan: PLAN,
  planMarkdown: "## Plan\n\n- Add a `posts` table",
  planStatus: "pending",
  request: { message: "add a posts table", rounds: [] },
  retrievedContext: "",
  role: "assistant",
  steps: [
    { at: 1000, label: "Understanding your request" },
    { at: 2000, label: "Writing the plan" },
  ],
  thinkingMs: 4000,
};

const proposalMessage = {
  content: "Here is the schema. It parses and passes the checks.",
  id: "a2",
  phase: "DONE",
  plan: PLAN,
  planMarkdown: "## Plan\n\n- Add a `posts` table",
  planStatus: "approved",
  previousDbml: SAVED,
  proposal: {
    attempts: 2,
    dbml: PROPOSED,
    outsidePlan: [],
    problems: [],
    valid: true,
  },
  request: { message: "add a posts table", rounds: [] },
  role: "assistant",
};

/** Puts a project (with a saved chat) and an AI key into the browser's database. */
async function seed(page: Page, aiChatHistory: unknown[]) {
  await page.goto("/");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  // Saving makes the app create its database, so the stores exist to write to.
  await page.getByRole("button", { exact: true, name: "Save" }).click();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((d) => d.name === "EnopsDevDB")
      )
    )
    .toBe(true);
  await page.waitForTimeout(500);
  await page.evaluate(
    async ({ history, id, saved, stack }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("EnopsDevDB");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(
          ["projects", "aiSettings"],
          "readwrite"
        );
        tx.objectStore("projects").put({
          aiChatHistory: history,
          createdAt: new Date(),
          dbml: saved,
          edges: [],
          id,
          name: "Shop",
          nodes: [],
          techStack: stack,
          updatedAt: new Date(),
        });
        tx.objectStore("aiSettings").put({
          updatedAt: new Date(),
          vercelAIKey: "test-key",
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      database.close();
      localStorage.setItem("current_project_id", id);
    },
    { history: aiChatHistory, id: PROJECT_ID, saved: SAVED, stack: TECH_STACK }
  );
  await page.reload();
  await page.getByTitle("AI Schema Assistant").click();
}

const versionsOf = (page: Page) =>
  page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("EnopsDevDB");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<{ label?: string; number: number }[]>(
        (resolve, reject) => {
          const request = database
            .transaction("versions", "readonly")
            .objectStore("versions")
            .getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
    } finally {
      database.close();
    }
  });

test("a saved plan shows its thinking, and can be rejected", async ({
  page,
}) => {
  await seed(page, [user, planMessage]);
  await expect(page.getByText("Thought for 4s · 2 steps")).toBeVisible();
  await expect(page.getByText("Awaiting approval")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve & Generate" })
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Plan rejected.")).toBeVisible();
});

test("applying a proposal saves a checkpoint, and it can be restored", async ({
  page,
}) => {
  await seed(page, [user, proposalMessage]);
  await expect(page.getByText("Review schema proposal")).toBeVisible();
  await expect(page.getByText("It took 2 attempts")).toBeVisible();

  await page.getByRole("button", { name: "Apply proposal" }).click();
  await expect(page.getByText("Checkpoint v1 saved").first()).toBeVisible();
  // The chat replaces the editor while it is open, so check the diagram.
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  const versions = await versionsOf(page);
  expect(versions).toHaveLength(1);
  expect(versions[0]?.label).toContain("Checkpoint before AI");

  await page.getByRole("button", { name: "Restore previous schema" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
  await expect(
    page.getByText("Restored the schema from before this change.").first()
  ).toBeVisible();
});

test("a proposal is refused once the schema has changed", async ({ page }) => {
  await seed(page, [user, proposalMessage]);
  // Edit the schema in the editor, then come back to the chat.
  await page.getByTitle("Toggle Editor").click();
  await page.locator(".cm-content").fill("Table other {\n id int [pk]\n}");
  await expect(page.locator(".react-flow__node").first()).toContainText(
    "other"
  );
  await page.getByTitle("AI Schema Assistant").click();
  await expect(
    page.getByText("The schema changed after this was written.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply proposal" })
  ).toBeDisabled();
});

test("the model can be chosen, and the choice is remembered", async ({
  page,
}) => {
  await seed(page, []);
  await page.getByRole("button", { name: "Manual control" }).click();
  await expect(page.getByRole("combobox", { name: "Model" })).toBeVisible();
  await page.getByRole("button", { name: /^Plan:/ }).click();
  await page.reload();
  await page.getByTitle("AI Schema Assistant").click();
  await expect(
    page.getByRole("button", { name: "Manual control" })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /^Plan:/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("a running request shows its steps and can be stopped, then retried", async ({
  page,
}) => {
  // The gateway never answers, so the request stays in flight until Stop.
  await page.route("**/ai-gateway.vercel.sh/**", () => new Promise(() => {}));
  await seed(page, []);
  await page.getByPlaceholder(/Describe what to create/).fill("add a phone");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/^Thinking/)).toBeVisible();
  await expect(page.getByText("Understanding your request")).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText("Stopped. Nothing was changed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("a failed request shows the error and a retry", async ({ page }) => {
  await page.route("**/ai-gateway.vercel.sh/**", (route) =>
    route.fulfill({
      body: JSON.stringify({ error: { message: "Invalid API key" } }),
      contentType: "application/json",
      status: 401,
    })
  );
  await seed(page, []);
  await page.getByPlaceholder(/Describe what to create/).fill("add a phone");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({
    timeout: 15_000,
  });
});
