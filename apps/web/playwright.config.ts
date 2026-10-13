import { defineConfig } from "@playwright/test";

export default defineConfig({
  // A shared CI runner can be several times slower than a laptop, so waits for
  // the diagram to follow the editor get more room, and one retry absorbs a
  // rare stall. A test that fails twice is a real failure.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3107",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm start --port 3107 --hostname 127.0.0.1",
    reuseExistingServer: false,
    timeout: 60_000,
    url: "http://127.0.0.1:3107",
  },
  workers: 1,
});
