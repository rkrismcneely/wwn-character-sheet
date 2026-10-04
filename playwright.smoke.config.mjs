import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./tests/e2e/fixtures.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results/browser-smoke",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report/browser-smoke" }],
  ],
  use: {
    baseURL: E2E_ORIGIN,
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "node scripts/start-browser-smoke-worker.mjs",
    url: E2E_ORIGIN,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
