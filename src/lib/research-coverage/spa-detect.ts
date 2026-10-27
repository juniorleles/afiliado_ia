export const PAGE_RENDER_MODES = [
  "STATIC_HTML",
  "SPA_SUSPECTED",
  "BROWSER_RENDER_REQUIRED",
  "UNKNOWN",
] as const;
export type PageRenderMode = (typeof PAGE_RENDER_MODES)[number];

const EMPTY_ROOT = /<(div|main|app)[^>]+\bid=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/\1>/i;
const APP_BUNDLE = /<script[^>]+type=["']module["'][^>]+src=["'][^"']*\/assets\/index-[^"']+\.js["']/i;
const FRAMEWORK_MOUNT =
  /data-reactroot|id=["']__next["']|id=["']__nuxt["']|ng-version=|data-server-rendered|vite|webpackJsonp/i;
const MAIN_COPY = /<(article|main|section|h1|h2|p|li)\b/i;

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function visibleText(html: string): string {
  return stripNoise(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasMetaProductCopy(html: string): boolean {
  return /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["'][^"']{40,}["']/i.test(html);
}

export function classifyPageRenderMode(input: {
  html?: string | null;
  contentType?: string | null;
  ok?: boolean;
}): { mode: PageRenderMode; reasons: string[]; signals: Record<string, boolean | number> } {
  const html = input.html ?? "";
  const type = (input.contentType ?? "").toLowerCase();
  if (input.ok === false || !html.trim()) {
    return { mode: "UNKNOWN", reasons: ["No HTML body was available to classify."], signals: { bytes: html.length } };
  }
  if (type && !/html|xml|text\/plain/.test(type)) {
    return { mode: "UNKNOWN", reasons: ["The response is not HTML."], signals: { bytes: html.length } };
  }

  const text = visibleText(html);
  const bytes = Buffer.byteLength(html, "utf8");
  const emptyRoot = EMPTY_ROOT.test(html);
  const appBundle = APP_BUNDLE.test(html);
  const framework = FRAMEWORK_MOUNT.test(html);
  const hasMain = MAIN_COPY.test(stripNoise(html));
  const metaOnly = hasMetaProductCopy(html) && text.length < 220;
  const short = bytes < 8_000;
  const usableCopy = text.length >= 400 && hasMain && !emptyRoot;

  const signals = {
    bytes,
    visibleChars: text.length,
    emptyRoot,
    appBundle,
    framework,
    hasMain,
    metaOnly,
    short,
  };

  if (usableCopy) {
    return { mode: "STATIC_HTML", reasons: ["Visible product copy is present in the fetched HTML."], signals };
  }

  const spaSignals = [emptyRoot, appBundle, framework, metaOnly].filter(Boolean).length;
  if (emptyRoot && (appBundle || framework) && text.length < 220) {
    return {
      mode: "BROWSER_RENDER_REQUIRED",
      reasons: [
        "The document mounts an empty application root.",
        appBundle ? "An application bundle is present." : "A client-framework mount is present.",
        "Visible body text is not enough for extraction.",
      ],
      signals,
    };
  }
  if (spaSignals >= 2 && !usableCopy) {
    return {
      mode: "SPA_SUSPECTED",
      reasons: ["More than one client-render signal is present and the visible body is thin."],
      signals,
    };
  }
  if (short && hasMain && !emptyRoot && !appBundle) {
    return {
      mode: "STATIC_HTML",
      reasons: ["A short page can still be static HTML when it has visible markup and no empty application root."],
      signals,
    };
  }
  if (!hasMain && text.length < 80) {
    return { mode: "UNKNOWN", reasons: ["The document has almost no visible structure."], signals };
  }
  return { mode: "STATIC_HTML", reasons: ["No reliable client-render pattern was found."], signals };
}

export function visibleTextFromHtml(html: string): string {
  return visibleText(html);
}
