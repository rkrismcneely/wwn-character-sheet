import { defineConfig, devices } from "@playwright/test";
import { E2E_ORIGIN } from "./tests/e2e/fixtures.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: E2E_ORIGIN,
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "npm run build && npm run e2e:server",
    url: E2E_ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
