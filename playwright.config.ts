import { defineConfig, devices } from "@playwright/test";

const port = 3210;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run setup && npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/admin/organic-video-lab`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      APP_URL: baseURL,
      DATABASE_URL: "./data/e2e.db",
      STORAGE_ROOT: "./data/e2e-storage",
      REMOTION_OUTPUT_DIR: "./data/e2e-renders",
      LLM_REAL_CALLS_ENABLED: "false",
      HEYGEN_REAL_CALLS_ENABLED: "false",
      MOCK_VIDEO_DURATION_SECONDS: "4",
    },
  },
});
