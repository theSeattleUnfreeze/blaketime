import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/web",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "node tests/fixtures/web-server.ts",
    url: "http://127.0.0.1:4173/healthz",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
