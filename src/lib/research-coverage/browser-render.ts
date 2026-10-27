import type { Browser, Page } from "playwright";
import { inspectPublicHttpsUrl, inspectResolvedPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { MAX_HTML_BYTES } from "@/lib/real-product-assets/fetch";

export const BROWSER_RENDER_LIMITS = {
  navigationTimeoutMs: 15_000,
  settleTimeoutMs: 8_000,
  totalTimeoutMs: 25_000,
  maxHtmlBytes: MAX_HTML_BYTES,
  maxRedirects: 3,
} as const;

const CHECKOUT_PATH = /\/(cart|checkout|order-now|ordernow|payment|purchase|billing|subscribe)(\/|$|\.)/i;
const BLOCKED_SCHEME = /^(file|ftp|blob|javascript|chrome|devtools|about):/i;

export type BrowserRenderStatus =
  | "RENDERED"
  | "BROWSER_UNAVAILABLE"
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "SECURITY_BLOCKED"
  | "CHECKOUT_BLOCKED"
  | "EMPTY"
  | "SIZE_LIMIT";

export type BrowserRenderResult = {
  ok: boolean;
  status: BrowserRenderStatus;
  requestedUrl: string;
  finalUrl: string | null;
  html: string;
  visibleText: string;
  title: string | null;
  elapsedMs: number;
  reason: string | null;
};

export type RenderPublicPage = (url: string) => Promise<BrowserRenderResult>;

function blockedDocument(url: string): string | null {
  if (BLOCKED_SCHEME.test(url) || url.startsWith("data:")) return "Local and non-HTTPS schemes are blocked.";
  if (CHECKOUT_PATH.test(url)) return "Checkout, payment, and order paths are not opened.";
  const safe = inspectPublicHttpsUrl(url);
  if (!safe.ok) return safe.reason;
  return null;
}

async function launchBrowser(): Promise<Browser | null> {
  try {
    const { chromium } = await import("playwright");
    try {
      return await chromium.launch({
        headless: true,
        channel: "chrome",
        args: ["--disable-dev-shm-usage", "--disable-extensions", "--no-first-run", "--disable-sync"],
      });
    } catch {
      try {
        return await chromium.launch({
          headless: true,
          channel: "msedge",
          args: ["--disable-dev-shm-usage", "--disable-extensions", "--no-first-run"],
        });
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

async function attachGuards(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const href = route.request().url();
    const kind = route.request().resourceType();
    if (href.startsWith("data:image/")) {
      await route.continue();
      return;
    }
    if (BLOCKED_SCHEME.test(href) || href.startsWith("data:")) {
      await route.abort();
      return;
    }
    if (kind === "document") {
      const block = blockedDocument(href);
      if (block) {
        await route.abort();
        return;
      }
      const dns = await inspectResolvedPublicHttpsUrl(href);
      if (!dns.ok) {
        await route.abort();
        return;
      }
    } else {
      const safe = inspectPublicHttpsUrl(href);
      if (!safe.ok) {
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
}

export async function renderPublicPage(url: string): Promise<BrowserRenderResult> {
  const started = Date.now();
  const fail = (status: BrowserRenderStatus, reason: string, finalUrl: string | null = null): BrowserRenderResult => ({
    ok: false,
    status,
    requestedUrl: url,
    finalUrl,
    html: "",
    visibleText: "",
    title: null,
    elapsedMs: Date.now() - started,
    reason,
  });

  const resolved = await inspectResolvedPublicHttpsUrl(url);
  if (!resolved.ok) return fail("SECURITY_BLOCKED", resolved.reason);

  const browser = await launchBrowser();
  if (!browser) {
    return fail("BROWSER_UNAVAILABLE", "No isolated system browser channel is available.");
  }

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await attachGuards(page);

    const remaining = Math.max(1_000, BROWSER_RENDER_LIMITS.totalTimeoutMs - (Date.now() - started));
    await page.goto(resolved.url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.min(BROWSER_RENDER_LIMITS.navigationTimeoutMs, remaining),
    });
    const afterGoto = blockedDocument(page.url());
    if (afterGoto) {
      await context.close();
      return fail(afterGoto.includes("Checkout") ? "CHECKOUT_BLOCKED" : "SECURITY_BLOCKED", afterGoto, page.url());
    }
    const settle = Math.min(
      BROWSER_RENDER_LIMITS.settleTimeoutMs,
      Math.max(500, BROWSER_RENDER_LIMITS.totalTimeoutMs - (Date.now() - started)),
    );
    await page
      .waitForFunction(() => (document.body?.innerText ? document.body.innerText.trim().length : 0) > 200, null, {
        timeout: settle,
      })
      .catch(() => undefined);

    const html = await page.content();
    const visibleText = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").trim();
    const title = (await page.title().catch(() => "")) || null;
    const finalUrl = page.url();
    await context.close();

    if (Buffer.byteLength(html, "utf8") > BROWSER_RENDER_LIMITS.maxHtmlBytes) {
      return fail("SIZE_LIMIT", "Rendered HTML exceeded the size limit.", finalUrl);
    }
    if (!html.trim()) return fail("EMPTY", "The browser produced an empty document.", finalUrl);
    return {
      ok: true,
      status: "RENDERED",
      requestedUrl: url,
      finalUrl,
      html,
      visibleText,
      title,
      elapsedMs: Date.now() - started,
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser navigation failed.";
    const status: BrowserRenderStatus = /timeout|exceeded/i.test(message) ? "TIMEOUT" : "NAVIGATION_FAILED";
    return fail(status, message);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
