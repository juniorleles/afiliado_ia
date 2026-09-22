import type { LayoutSnapshot } from "@/lib/visual-qa/types";

/**
 * Runs inside the browser via Playwright page.evaluate.
 * Must stay self-contained (no Node imports / closures).
 */
export function collectLayoutSnapshot(): LayoutSnapshot {
  const article = document.querySelector("article") ?? document.body;
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    label: `${window.innerWidth}x${window.innerHeight}`,
  };
  const scrollWidth = document.documentElement.scrollWidth;
  const clientWidth = document.documentElement.clientWidth;
  const pageHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    article.scrollHeight,
  );

  const h1El = document.querySelector("h1");
  let h1: LayoutSnapshot["h1"] = null;
  if (h1El) {
    const rect = h1El.getBoundingClientRect();
    const styles = window.getComputedStyle(h1El);
    const fontSize = Number.parseFloat(styles.fontSize) || 0;
    const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.2;
    h1 = {
      text: (h1El.textContent || "").trim().slice(0, 240),
      fontSize,
      width: rect.width,
      height: rect.height,
      wraps: lineHeight > 0 ? rect.height > lineHeight * 1.6 : rect.height > 80,
    };
  }

  const h2 = [...document.querySelectorAll("h2")].map((el) => (el.textContent || "").trim()).filter(Boolean);

  const images: LayoutSnapshot["images"] = [];
  article.querySelectorAll("img, [role='img']").forEach((node) => {
    const el = node as HTMLElement;
    const rect = el.getBoundingClientRect();
    const img = node as HTMLImageElement;
    const alt = (el.getAttribute("aria-label") || img.alt || "").trim();
    const text = (el.textContent || "").trim();
    const placeholder =
      /packshot was not available|product visual placeholder|placeholder/i.test(`${alt} ${text}`) ||
      el.getAttribute("data-placeholder") === "true";
    if (rect.width < 2 || rect.height < 2) return;
    images.push({
      alt: alt.slice(0, 180),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
      role: el.getAttribute("role") || node.tagName.toLowerCase(),
      placeholder,
    });
  });

  const cardNodes = [...article.querySelectorAll("li.rounded-lg, li[class*='rounded-lg'], ul[class*='grid'] > li")];
  const cardHeights = cardNodes.map((el) => (el as HTMLElement).getBoundingClientRect().height);
  const uniqueTexts = new Set(
    cardNodes.map((el) => ((el as HTMLElement).textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)),
  );
  const cards = {
    count: cardNodes.length,
    uniqueTexts: uniqueTexts.size,
    avgHeight: cardHeights.length
      ? cardHeights.reduce((sum, n) => sum + n, 0) / cardHeights.length
      : 0,
  };

  const paragraphEls = [...article.querySelectorAll("p")];
  const lengths = paragraphEls.map((el) => ((el.textContent || "").trim().length));
  const paragraphs = {
    count: paragraphEls.length,
    longCount: lengths.filter((n) => n >= 220).length,
    maxChars: lengths.reduce((max, n) => Math.max(max, n), 0),
  };

  const ctas = [...document.querySelectorAll("[data-cta-position]")].map((node) => {
    const el = node as HTMLElement;
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    const visible =
      styles.display !== "none" &&
      styles.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;
    return {
      position: el.getAttribute("data-cta-position") || "unknown",
      width: rect.width,
      height: rect.height,
      visible,
      top: rect.top + window.scrollY,
    };
  });

  const sticky = document.querySelector('[data-cta-position="sticky"]');
  const stickyDisplay = sticky ? window.getComputedStyle(sticky).display : null;

  const bodyText = (document.body.innerText || "").replace(/\s+/g, " ");
  const disclosurePresent = /i may earn a commission|affiliate disclosure/i.test(bodyText);
  const healthDisclaimerPresent = /not a substitute for professional medical advice/i.test(bodyText);

  const footerLinks = [...document.querySelectorAll("footer a")].map((a) => (a.textContent || "").trim());

  const fakeTrustHits: string[] = [];
  const fakePatterns: Array<[RegExp, string]> = [
    [/\b[0-9]\.[0-9]\s*\/\s*5\b/, "star-rating"],
    [/\b\d{3,}\s+reviews?\b/i, "review-count"],
    [/\bonly \d+ left\b/i, "scarcity"],
    [/\bsomeone (just )?purchased\b/i, "recent-purchase"],
    [/\boffer ends? in\b/i, "countdown"],
    [/\bcertified by\b/i, "fake-certification"],
  ];
  for (const [re, label] of fakePatterns) {
    if (re.test(bodyText)) fakeTrustHits.push(label);
  }

  return {
    viewport,
    scrollWidth,
    clientWidth,
    pageHeight,
    overflowX: scrollWidth > clientWidth + 2,
    h1,
    h2,
    images,
    cards,
    paragraphs,
    ctas,
    stickyDisplay,
    disclosurePresent,
    footerLinks,
    healthDisclaimerPresent,
    faqDetails: document.querySelectorAll("article details").length,
    fakeTrustHits,
    articlePresent: Boolean(document.querySelector("article")),
  };
}
