import { fetchPublicHttps, type SafeFetchResult } from "@/lib/real-product-assets/fetch";
import { classifyPageRenderMode, visibleTextFromHtml, type PageRenderMode } from "@/lib/research-coverage/spa-detect";
import { renderPublicPage, type RenderPublicPage } from "@/lib/research-coverage/browser-render";

type FetchPageFn = (url: string) => Promise<SafeFetchResult>;

export type ExtractionMode = "HTTP" | "BROWSER_RENDERED";

export type ResearchFetchResult = SafeFetchResult & {
  extractionMode: ExtractionMode;
  renderMode: PageRenderMode;
  renderReasons: string[];
  renderStatus?: string;
};

const browserBudget = { used: 0 };
export const MAX_BROWSER_RENDERS = 2;

export function resetBrowserRenderBudget(): void {
  browserBudget.used = 0;
}

function withMeta(
  result: SafeFetchResult,
  meta: { extractionMode: ExtractionMode; renderMode: PageRenderMode; renderReasons: string[]; renderStatus?: string },
): ResearchFetchResult {
  return { ...result, ...meta };
}

function shouldRender(mode: PageRenderMode, html: string): boolean {
  if (mode === "BROWSER_RENDER_REQUIRED") return true;
  if (mode === "SPA_SUSPECTED" && visibleTextFromHtml(html).length < 220) return true;
  return false;
}

export async function fetchPublicPageForResearch(
  url: string,
  deps?: { fetchPage?: FetchPageFn; renderPage?: RenderPublicPage },
): Promise<ResearchFetchResult> {
  const fetchPage = deps?.fetchPage ?? fetchPublicHttps;
  const renderPage = deps?.renderPage ?? renderPublicPage;
  const http = await fetchPage(url);
  if (!http.ok) {
    return withMeta(http, {
      extractionMode: "HTTP",
      renderMode: "UNKNOWN",
      renderReasons: [http.reason],
    });
  }
  const html = http.body.toString("utf8");
  const detected = classifyPageRenderMode({ html, contentType: http.contentType, ok: true });
  if (!shouldRender(detected.mode, html) || browserBudget.used >= MAX_BROWSER_RENDERS) {
    return withMeta(http, {
      extractionMode: "HTTP",
      renderMode: detected.mode,
      renderReasons: detected.reasons,
    });
  }
  browserBudget.used += 1;
  const rendered = await renderPage(http.url);
  if (!rendered.ok) {
    return withMeta(http, {
      extractionMode: "HTTP",
      renderMode: detected.mode,
      renderReasons: [...detected.reasons, rendered.reason ?? rendered.status],
      renderStatus: rendered.status,
    });
  }
  if (visibleTextFromHtml(rendered.html).length <= visibleTextFromHtml(html).length && rendered.visibleText.length < 220) {
    return withMeta(http, {
      extractionMode: "HTTP",
      renderMode: detected.mode,
      renderReasons: [...detected.reasons, "Browser rendering did not add usable visible text."],
      renderStatus: rendered.status,
    });
  }
  return withMeta(
    {
      ok: true,
      url: rendered.finalUrl || http.url,
      status: http.status,
      contentType: "text/html",
      body: Buffer.from(rendered.html, "utf8"),
    },
    {
      extractionMode: "BROWSER_RENDERED",
      renderMode: detected.mode,
      renderReasons: detected.reasons,
      renderStatus: rendered.status,
    },
  );
}
