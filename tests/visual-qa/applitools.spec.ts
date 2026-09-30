import { test } from "@playwright/test";
import { ClassicRunner, Eyes, Target } from "@applitools/eyes-playwright";
import { openStablePreview } from "./prepare";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`applitools ${viewport.name}`, async ({ page }) => {
    test.skip(!process.env.APPLITOOLS_API_KEY, "APPLITOOLS_API_KEY is not set");
    const runner = new ClassicRunner();
    const eyes = new Eyes(runner);
    if (process.env.APPLITOOLS_SERVER_URL) {
      eyes.setConfiguration({ serverUrl: process.env.APPLITOOLS_SERVER_URL });
    }
    try {
      await openStablePreview(page, viewport.width, viewport.height);
      await eyes.open(page, "Afiliado IA", `premium-final-candidate-v2-${viewport.name}`, {
        width: viewport.width,
        height: viewport.height,
      });
      await eyes.check(`viewport-${viewport.name}`, Target.window().fully());
      await eyes.close();
    } finally {
      if (eyes.getIsOpen()) await eyes.abort();
    }
  });
}
