import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // The S0 Kaneo baseline is retained as historical evidence, not a RelayOps flow.
  testMatch: "**/relayops-*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./node_modules/.cache/playwright-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:32041",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:32041",
          localStorage: [{ name: "relayops.locale", value: "en-US" }],
        },
      ],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
