import { defineConfig } from "@playwright/test";
import { READY_TOKEN } from "./scripts/dev-server/core";

const baseURL = process.env.VISUAL_QA_BASE_URL ?? "http://127.0.0.1:3000";
const readyPattern = READY_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const webServer = {
  command: "npx tsx scripts/dev-server-manager.ts",
  timeout: 90_000,
  stdout: "pipe" as const,
  stderr: "pipe" as const,
  wait: {
    stdout: new RegExp(`${readyPattern} port=(?<dev_server_port>\\d+|unknown)`),
  },
};

export default defineConfig({
  testDir: "./tests/visual-qa",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  globalSetup: "./tests/visual-qa/global-setup.ts",
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/approved-baselines/{arg}{ext}",
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
  },
  webServer,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
