import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  reporter: "list",
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
