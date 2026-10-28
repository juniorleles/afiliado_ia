import type { Browser, Page } from "playwright";
import { inspectPublicHttpsUrl, inspectResolvedPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { MAX_HTML_BYTES } from "@/lib/real-product-assets/fetch";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import { isTransactionalControlText } from "@/lib/campaign-sources/primary-extract";
import {
  publicLandingUrl,
  sameLandingPage,
  type PrimaryAffiliatePage,
} from "@/lib/campaign-sources/primary-page";

export const PRIMARY_RENDER_LIMITS = {
  navigationTimeoutMs: 20_000,
  settleTimeoutMs: 10_000,
  totalTimeoutMs: 35_000,
  maxHtmlBytes: MAX_HTML_BYTES,
  maxContentClicks: 24,
} as const;

export type PrimaryRenderStatus =
  | "RENDERED"
  | "BROWSER_UNAVAILABLE"
  | "TIMEOUT"
  | "NAVIGATION_FAILED"
  | "SECURITY_BLOCKED"
  | "CHECKOUT_REDIRECT_BLOCKED"
  | "NEEDS_ALTERNATIVE"
  | "EMPTY"
  | "SIZE_LIMIT";

export type PrimaryRenderResult = {
  ok: boolean;
  status: PrimaryRenderStatus;
  requestedUrl: string;
  finalUrl: string | null;
  html: string;
  visibleText: string;
  title: string | null;
  expandedControls: number;
  transactionalClicks: 0;
  elapsedMs: number;
  reason: string | null;
};

const BLOCKED_SCHEME = /^(file|ftp|blob|javascript|chrome|devtools|about):/i;
const CHECKOUT_PATH =
  /\/(cart|checkout|payment|pay|billing|order-now|ordernow|buy-now|buynow|add-to-cart|place-order)(\/|$|\.)/i;
const PAYMENT_HOST = /(paypal|stripe|checkout\.|secure\.|\.clickbank\.net)$/i;

function publicUrl(raw: string): string {
  return publicLandingUrl(raw);
}

function isAllowedPrimaryDocument(url: string, primary: PrimaryAffiliatePage): boolean {
  if (sameLandingPage(url, `https://${primary.host}${primary.path}`)) return true;
  if (sameLandingPage(url, primary.publicUrl)) return true;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== primary.host) return false;
    if (CHECKOUT_PATH.test(parsed.pathname) && parsed.pathname.toLowerCase() !== (primary.path || "/").toLowerCase()) {
      return false;
    }
    return !PAYMENT_HOST.test(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function blockedDocument(url: string, primary: PrimaryAffiliatePage): string | null {
  if (BLOCKED_SCHEME.test(url) || url.startsWith("data:")) return "Local and non-HTTPS schemes are blocked.";
  if (isAllowedPrimaryDocument(url, primary)) return null;
  if (CHECKOUT_PATH.test(url) || classifyUrlRoles(url).checkout) {
    return "Additional checkout or payment paths are not opened.";
  }
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

async function attachGuards(page: Page, primary: PrimaryAffiliatePage): Promise<void> {
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
      const block = blockedDocument(href, primary);
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

async function expandContentControls(page: Page): Promise<number> {
  let expanded = 0;
  await page.evaluate(() => {
    document.querySelectorAll("details:not([open])").forEach((node) => {
      (node as HTMLDetailsElement).open = true;
    });
  }).catch(() => undefined);

  const locators = page.locator(
    'summary, [aria-expanded="false"], [data-faq], .faq button, .accordion button, [class*="accordion"] button, [class*="faq"] button',
  );
  const count = Math.min(await locators.count().catch(() => 0), PRIMARY_RENDER_LIMITS.maxContentClicks);
  for (let i = 0; i < count; i += 1) {
    const handle = locators.nth(i);
    const text = (await handle.innerText().catch(() => "")).trim();
    const type = (await handle.getAttribute("type").catch(() => "")) || "";
    const href = (await handle.getAttribute("href").catch(() => "")) || "";
    if (type === "submit") continue;
    if (isTransactionalControlText(`${text} ${href}`)) continue;
    if (href && !href.startsWith("#") && !/^javascript:/i.test(href)) continue;
    await handle.click({ timeout: 800 }).then(() => {
      expanded += 1;
    }).catch(() => undefined);
  }
  return expanded;
}

export async function renderPrimaryAffiliatePage(input: {
  url: string;
  primary: PrimaryAffiliatePage;
}): Promise<PrimaryRenderResult> {
  const started = Date.now();
  const fail = (status: PrimaryRenderStatus, reason: string, finalUrl: string | null = null): PrimaryRenderResult => ({
    ok: false,
    status,
    requestedUrl: publicUrl(input.url),
    finalUrl,
    html: "",
    visibleText: "",
    title: null,
    expandedControls: 0,
    transactionalClicks: 0,
    elapsedMs: Date.now() - started,
    reason,
  });

  if (!input.primary.readAllowed) {
    return fail("SECURITY_BLOCKED", input.primary.notes[0] ?? "Primary page read is not allowed.");
  }
  const resolved = await inspectResolvedPublicHttpsUrl(input.url);
  if (!resolved.ok) return fail("SECURITY_BLOCKED", resolved.reason);

  const browser = await launchBrowser();
  if (!browser) {
    return fail("BROWSER_UNAVAILABLE", "No isolated system browser channel is available. Provide exported HTML or a public content URL.");
  }

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      bypassCSP: false,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
    await attachGuards(page, input.primary);

    const remaining = Math.max(1_000, PRIMARY_RENDER_LIMITS.totalTimeoutMs - (Date.now() - started));
    await page.goto(resolved.url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: Math.min(PRIMARY_RENDER_LIMITS.navigationTimeoutMs, remaining),
    });
    const landed = page.url();
    const afterGoto = blockedDocument(landed, input.primary);
    if (afterGoto) {
      await context.close();
      return fail(
        /checkout|payment/i.test(afterGoto) ? "CHECKOUT_REDIRECT_BLOCKED" : "SECURITY_BLOCKED",
        afterGoto,
        publicUrl(landed),
      );
    }
    const expandedControls = await expandContentControls(page);
    const settle = Math.min(
      PRIMARY_RENDER_LIMITS.settleTimeoutMs,
      Math.max(500, PRIMARY_RENDER_LIMITS.totalTimeoutMs - (Date.now() - started)),
    );
    await page
      .waitForFunction(() => (document.body?.innerText ? document.body.innerText.trim().length : 0) > 120, null, {
        timeout: settle,
      })
      .catch(() => undefined);

    const html = await page.content();
    const visibleText = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").trim();
    const title = (await page.title().catch(() => "")) || null;
    const finalUrl = publicUrl(page.url());
    await context.close();

    if (Buffer.byteLength(html, "utf8") > PRIMARY_RENDER_LIMITS.maxHtmlBytes) {
      return fail("SIZE_LIMIT", "Rendered HTML exceeded the size limit.", finalUrl);
    }
    if (!html.trim()) return fail("EMPTY", "The browser produced an empty document.", finalUrl);
    if (/captcha|are you a robot|access denied|cf-challenge/i.test(visibleText) && visibleText.length < 400) {
      return {
        ok: false,
        status: "NEEDS_ALTERNATIVE",
        requestedUrl: publicUrl(input.url),
        finalUrl,
        html: "",
        visibleText: "",
        title,
        expandedControls,
        transactionalClicks: 0,
        elapsedMs: Date.now() - started,
        reason: "The destination blocked automated reading. Provide exported HTML or a public content URL.",
      };
    }
    return {
      ok: true,
      status: "RENDERED",
      requestedUrl: publicUrl(input.url),
      finalUrl,
      html,
      visibleText,
      title,
      expandedControls,
      transactionalClicks: 0,
      elapsedMs: Date.now() - started,
      reason: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Browser navigation failed.";
    const status: PrimaryRenderStatus = /timeout|exceeded/i.test(message) ? "TIMEOUT" : "NAVIGATION_FAILED";
    return fail(status, message);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
