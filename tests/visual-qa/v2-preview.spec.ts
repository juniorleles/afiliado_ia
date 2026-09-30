import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { openStablePreview } from "./prepare";

const OUT = path.join(process.cwd(), "data", "production-readiness", "visual-qa-tooling-v2", "screenshots");
const APPROVED = path.join(process.cwd(), "tests", "visual-qa", "approved-baselines");

const VIEWPORTS = [
  { name: "375", width: 375, height: 812, fullPage: false },
  { name: "390", width: 390, height: 844, fullPage: true },
  { name: "768", width: 768, height: 1024, fullPage: false },
  { name: "1024", width: 1024, height: 768, fullPage: false },
  { name: "1440", width: 1440, height: 900, fullPage: true },
] as const;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

for (const viewport of VIEWPORTS) {
  test(`candidate viewport ${viewport.name}`, async ({ page }) => {
    await openStablePreview(page, viewport.width, viewport.height);
    const candidate = path.join(OUT, `viewport-${viewport.name}.png`);
    await page.screenshot({ path: candidate, animations: "disabled", caret: "hide" });
    const approved = path.join(APPROVED, `viewport-${viewport.name}.png`);
    if (!existsSync(approved)) {
      test.info().annotations.push({ type: "baseline", description: "PENDING_HUMAN_APPROVAL" });
      return;
    }
    const { expect } = await import("@playwright/test");
    await expect(page).toHaveScreenshot(`viewport-${viewport.name}.png`, { animations: "disabled", caret: "hide" });
  });

  if (viewport.fullPage) {
    test(`candidate full page ${viewport.name}`, async ({ page }) => {
      await openStablePreview(page, viewport.width, viewport.height);
      const candidate = path.join(OUT, `fullpage-${viewport.name}.png`);
      await page.screenshot({ path: candidate, fullPage: true, animations: "disabled", caret: "hide" });
      const approved = path.join(APPROVED, `fullpage-${viewport.name}.png`);
      if (!existsSync(approved)) {
        test.info().annotations.push({ type: "baseline", description: "PENDING_HUMAN_APPROVAL" });
        return;
      }
      const { expect } = await import("@playwright/test");
      await expect(page).toHaveScreenshot(`fullpage-${viewport.name}.png`, {
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      });
    });
  }
}
