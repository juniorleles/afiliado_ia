import type { Page } from "@playwright/test";

export const PREVIEW_PATH = "/admin/preview/joint-genesis-controlled-ready-13";

export async function openStablePreview(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(PREVIEW_PATH, { waitUntil: "load", timeout: 90_000 });
  await page.getByRole("heading", { name: "Joint Genesis", level: 1 }).waitFor({ timeout: 30_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (img) => {
        if (img.complete) return;
        try {
          await img.decode();
        } catch {
          // A failed decode stays visible in the screenshot. Do not hide it.
        }
      }),
    );
  });
  const presentation = page.locator("[data-presell-presentation]");
  await presentation.evaluate((el) => el.scrollIntoView({ block: "start" }));
}
