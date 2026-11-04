import { chromium } from "playwright";

async function main() {
  const url =
    "http://127.0.0.1:3000/admin/lab/lp-generator/lp-mvs7mja3-0d690e7c/preview?visualCapture=visitor&candidate=54BX";
  const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("[data-v4='page']").waitFor({ timeout: 90_000 });
  const styles = await page.evaluate(() => {
    const foot = document.querySelector(".ds-footer") as HTMLElement | null;
    const cap = document.querySelector(".ds-footer .ds-caption") as HTMLElement | null;
    const link = document.querySelector(".ds-footer a") as HTMLElement | null;
    return {
      exec: document.querySelector("[data-v4='page']")?.getAttribute("data-presell-execution"),
      footerBg: foot ? getComputedStyle(foot).backgroundColor : null,
      footerColor: foot ? getComputedStyle(foot).color : null,
      captionColor: cap ? getComputedStyle(cap).color : null,
      captionSize: cap ? getComputedStyle(cap).fontSize : null,
      linkColor: link ? getComputedStyle(link).color : null,
    };
  });
  console.log(JSON.stringify(styles, null, 2));
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
