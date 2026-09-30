/**
 * Content Boundary Engine.
 *
 * Decides PAGE_STRUCTURE versus PRODUCT_CONTENT from document shape
 * before ProductFacts extraction. Product names, domains, and word
 * lists are not evidence. A heading that already names a product
 * section (ingredients, features, and the rest) owns the nodes under it.
 */

import { isQuestionHeading } from "@/lib/import-heuristics";

export const STRUCTURAL_CLASSES = [
  "PAGE_STRUCTURE",
  "PRIMARY_NAVIGATION",
  "SECONDARY_NAVIGATION",
  "FOOTER",
  "HEADER",
  "SIDEBAR",
  "COOKIE",
  "UTILITY",
  "LEGAL",
  "BREADCRUMB",
] as const;

export const PRODUCT_CLASSES = [
  "PRODUCT_CONTENT",
  "PRODUCT_DESCRIPTION",
  "INGREDIENT",
  "FEATURE",
  "FAQ",
  "USAGE",
  "WARNING",
  "GUARANTEE",
  "PRICING",
  "RETURN_POLICY",
  "SHIPPING",
  "MANUFACTURER",
] as const;

export const COMPARISON_CLASSES = [
  "COMPARISON_TABLE",
  "COMPARISON_HEADER",
  "COMPARISON_ROW_LABEL",
  "COMPARISON_VALUE",
  "DECORATIVE_CELL",
] as const;

export type StructuralClass = (typeof STRUCTURAL_CLASSES)[number];
export type ProductClass = (typeof PRODUCT_CLASSES)[number];
export type ComparisonClass = (typeof COMPARISON_CLASSES)[number];
export type BoundaryClass = StructuralClass | ProductClass | ComparisonClass;
export type BoundaryConfidence = "HIGH" | "MEDIUM" | "LOW";
export type BoundaryOrigin = "LANDMARK" | "LINK_CLUSTER" | "REPETITION" | "HEADING_OWNERSHIP" | "DOCUMENT_POSITION";

export type ContentSection = {
  classification: BoundaryClass;
  confidence: BoundaryConfidence;
  origin: BoundaryOrigin;
  start: number;
  end: number;
  labels: string[];
};

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

type Node = {
  tag: string;
  attrs: string;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  parent: number;
  closed: boolean;
};

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function visible(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function withoutEmbedded(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function roleOf(attrs: string): string {
  return attrs.match(/\brole\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase().trim().split(/\s+/)[0] ?? "";
}

function ariaLabel(attrs: string): string {
  return attrs.match(/\baria-label\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase().trim() ?? "";
}

function parseElements(html: string): Node[] {
  const nodes: Node[] = [];
  const stack: number[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  for (const match of html.matchAll(re)) {
    const full = match[0];
    const tag = match[1].toLowerCase();
    const isClose = full.startsWith("</");
    const index = match.index ?? 0;
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (nodes[stack[i]].tag !== tag) continue;
        const node = nodes[stack[i]];
        node.closeStart = index;
        node.end = index + full.length;
        node.closed = true;
        stack.length = i;
        break;
      }
      continue;
    }
    const node: Node = {
      tag,
      attrs: match[2] ?? "",
      start: index,
      openEnd: index + full.length,
      closeStart: index + full.length,
      end: index + full.length,
      parent: stack.length > 0 ? stack[stack.length - 1] : -1,
      closed: false,
    };
    nodes.push(node);
    if (!VOID_TAGS.has(tag) && !/\/>$/.test(full)) stack.push(nodes.length - 1);
  }
  for (const index of stack) {
    nodes[index].closeStart = html.length;
    nodes[index].end = html.length;
  }
  return nodes;
}

function ancestor(nodes: Node[], index: number, pred: (node: Node) => boolean): boolean {
  let parent = nodes[index]?.parent ?? -1;
  while (parent >= 0) {
    if (pred(nodes[parent])) return true;
    parent = nodes[parent].parent;
  }
  return false;
}

/**
 * A heading that names a product section. The words are the section's
 * own title, the same titles the importer already uses. They are not a
 * list of labels to reject.
 */
export function productSectionClass(title: string): ProductClass | null {
  const t = title.toLowerCase();
  if (isQuestionHeading(title) || /\b(faq|frequently asked)\b/.test(t)) return "FAQ";
  if (
    /\b(?:(?:key|active|main|core|listed)\s+)?ingredients?\b/i.test(t) ||
    /\b(what's inside|whats inside|composition|components?|materials?|supplement facts)\b/.test(t) ||
    /\byou['’]?ll find\b/.test(t) ||
    /^inside\b/.test(t)
  ) {
    return "INGREDIENT";
  }
  if (/\b(how it works|how to use|directions?|usage|suggested use|instructions|recommended use)\b/.test(t)) {
    return "USAGE";
  }
  if (/\b(warnings?|cautions?|precautions?|side effects|safety information)\b/.test(t)) return "WARNING";
  if (/\b(price|pricing|cost|msrp)\b/.test(t) && !isQuestionHeading(title)) return "PRICING";
  if (/\b(return policy|refund policy)\b/.test(t) || (/^returns?\b/.test(t) && !/\bguarantee\b/.test(t))) {
    return "RETURN_POLICY";
  }
  if (/\b(shipping|delivery|dispatch)\b/.test(t) && !/\b(guarantee|refund)\b/.test(t)) return "SHIPPING";
  if (/\b(guarantee|warranty|refund|money[- ]back)\b/.test(t)) return "GUARANTEE";
  if (/\b(manufacturer|made by|manufactured by|about (the )?brand|about (the )?company)\b/.test(t)) {
    return "MANUFACTURER";
  }
  if (/\b(features?|benefits?|key specs|specifications|what's included|whats included|highlights)\b/.test(t)) {
    return "FEATURE";
  }
  if (/^about\b/.test(t) && !/\b(brand|company|manufacturer)\b/.test(t)) return "PRODUCT_DESCRIPTION";
  return null;
}

export function isStructuralClass(classification: BoundaryClass): boolean {
  if (classification === "COMPARISON_TABLE") return false;
  return (
    (STRUCTURAL_CLASSES as readonly string[]).includes(classification) ||
    (COMPARISON_CLASSES as readonly string[]).includes(classification)
  );
}

type ProductRange = { start: number; end: number; classification: ProductClass; title: string };

function productRanges(html: string, nodes: Node[]): ProductRange[] {
  const headings = nodes.filter((node) => /^h[1-6]$/.test(node.tag));
  const ranges: ProductRange[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const level = Number(heading.tag.slice(1));
    const title = visible(html.slice(heading.openEnd, heading.closeStart));
    const classification = productSectionClass(title);
    if (!classification) continue;
    let end = html.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      const nextLevel = Number(headings[j].tag.slice(1));
      if (nextLevel <= level) {
        end = headings[j].start;
        break;
      }
    }
    ranges.push({ start: heading.start, end, classification, title });
  }
  return ranges;
}

function ownedByProduct(ranges: ProductRange[], offset: number): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function boundedEnd(node: Node, html: string): number {
  if (node.closed) return node.end;
  const rest = html.slice(node.openEnd);
  const next = rest.search(/<(?:h[1-3]|main|article)\b/i);
  return next >= 0 ? node.openEnd + next : html.length;
}

type ListShape = { labels: string[]; breadcrumb: boolean; cluster: boolean };

function plainLabel(text: string): string {
  return text.replace(/[›»>/|·•-]+/g, " ").replace(/\s+/g, " ").trim();
}

function comparisonCells(
  html: string,
  children: Node[],
): Array<{ node: Node; text: string; kind: "short" | "decorative" | "statement" | "boolean" | "evidence" }> | null {
  const cells = children.filter((child) => child.tag === "div" || child.tag === "td" || child.tag === "th" || child.tag === "span");
  if (cells.length < 3 || cells.length < children.length * 0.75) return null;
  return cells.map((node) => {
    const text = visible(html.slice(node.openEnd, node.closeStart));
    return { node, text, kind: comparisonCellKind(text) };
  });
}

function comparisonCellKind(text: string): "short" | "decorative" | "statement" | "boolean" | "evidence" {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || !/[a-z]/i.test(t)) return "decorative";
  if (/^(yes|no|y|n|true|false|included|not included|excluded|n\/a|na|none)$/i.test(t)) return "boolean";
  if (/\d|[$€£]/.test(t)) return "evidence";
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 8 || (t.length >= 40 && /[.!?]/.test(t))) return "statement";
  if (t.length <= 48 && words.length <= 6 && !/[.?!]/.test(t)) return "short";
  return "statement";
}

function listShape(html: string, node: Node): ListShape {
  const inner = html.slice(node.openEnd, node.closeStart);
  const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  const labels: string[] = [];
  for (const item of items) {
    const text = plainLabel(visible(item[1] ?? ""));
    const anchors = [...(item[1] ?? "").matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
    const anchorText = plainLabel(visible(anchors.map((anchor) => anchor[1] ?? "").join(" ")));
    const words = text.split(/\s+/).filter(Boolean);
    const short = text.length > 0 && text.length <= 48 && words.length <= 6 && !/[.?!]/.test(text);
    const linkOwned = anchors.length > 0 && anchorText === text;
    if (short && linkOwned) labels.push(text);
  }
  const between = items
    .slice(0, -1)
    .map((item) => {
      const after = (item.index ?? 0) + item[0].length;
      const next = inner.slice(after).search(/<li\b/i);
      return next >= 0 ? inner.slice(after, after + next) : "";
    })
    .join(" ");
  const separated = /[›»/]|›|»|&gt;|&raquo;/i.test(between);
  const named = ariaLabel(node.attrs) === "breadcrumb";
  const breadcrumb = (named || separated) && labels.length >= 2 && labels.length === items.length;
  const cluster = labels.length >= 3 && items.length > 0 && labels.length / items.length >= 0.75;
  return { labels, breadcrumb, cluster };
}

function shortAnchor(html: string, node: Node): string | null {
  if (node.tag !== "a") return null;
  const text = visible(html.slice(node.openEnd, node.closeStart));
  const words = text.split(/\s+/).filter(Boolean);
  if (!text || text.length > 48 || words.length > 6 || /[.?!]/.test(text)) return null;
  return text;
}

function gapIsSeparator(html: string, from: number, to: number): boolean {
  const gap = html.slice(from, to);
  if (/<\/?(?:div|p|h[1-6]|ul|ol|li|nav|header|footer|section|aside|main|article|form|table|tr|td)\b/i.test(gap)) {
    return false;
  }
  const text = visible(gap).replace(/[›»>/|·•-]+/g, "").trim();
  return text.length === 0;
}

export function classifyContentBoundaries(rawHtml: string): ContentSection[] {
  const html = withoutEmbedded(rawHtml);
  const nodes = parseElements(html);
  const products = productRanges(html, nodes);
  const sections: ContentSection[] = [];

  const push = (
    classification: BoundaryClass,
    confidence: BoundaryConfidence,
    origin: BoundaryOrigin,
    start: number,
    end: number,
    labels: string[],
  ) => {
    if (end <= start) return;
    sections.push({ classification, confidence, origin, start, end, labels });
  };

  let sawPrimary = false;
  const navClass = (): StructuralClass => {
    if (sawPrimary) return "SECONDARY_NAVIGATION";
    sawPrimary = true;
    return "PRIMARY_NAVIGATION";
  };

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const role = roleOf(node.attrs);
    const end = boundedEnd(node, html);
    const inMain = ancestor(nodes, index, (parent) => parent.tag === "main" || parent.tag === "article" || roleOf(parent.attrs) === "main");
    if (node.tag === "nav" || role === "navigation") {
      push(navClass(), "HIGH", "LANDMARK", node.start, end, linkLabelsInside(html, node));
      continue;
    }
    if (node.tag === "footer" || role === "contentinfo") {
      push("FOOTER", "HIGH", "LANDMARK", node.start, end, linkLabelsInside(html, node));
      continue;
    }
    if ((node.tag === "header" || role === "banner") && !inMain) {
      push("HEADER", "HIGH", "LANDMARK", node.start, end, linkLabelsInside(html, node));
      continue;
    }
    if (node.tag === "aside" || role === "complementary") {
      const holdsProduct = products.some((range) => range.start >= node.start && range.start < end);
      if (!holdsProduct) push("SIDEBAR", "HIGH", "LANDMARK", node.start, end, linkLabelsInside(html, node));
      continue;
    }
    if (role === "search" || (node.tag === "form" && /\btype\s*=\s*["']search["']/i.test(html.slice(node.openEnd, node.closeStart)))) {
      push("UTILITY", "HIGH", "LANDMARK", node.start, end, []);
      continue;
    }
    if (/\b(?:sr-only|visually-hidden)\b/i.test(node.attrs)) {
      push("UTILITY", "HIGH", "DOCUMENT_POSITION", node.start, end, [visible(html.slice(node.openEnd, node.closeStart))].filter(Boolean));
      continue;
    }
    if ((role === "dialog" || role === "alertdialog" || /\baria-modal\s*=\s*["']true["']/i.test(node.attrs)) && !ownedByProduct(products, node.start)) {
      const inner = html.slice(node.openEnd, node.closeStart);
      if (!/<h[1-6]\b/i.test(inner)) push("COOKIE", "MEDIUM", "LANDMARK", node.start, end, []);
    }
  }

  const body = nodes.find((node) => node.tag === "body");
  const firstHeading = nodes.find((node) => /^h[1-6]$/.test(node.tag));
  if (body) {
    const bodyIndex = nodes.indexOf(body);
    for (const child of nodes) {
      if (child.parent !== bodyIndex) continue;
      if (firstHeading && child.start >= firstHeading.start) continue;
      if (["header", "nav", "footer", "main", "article"].includes(child.tag)) continue;
      const inner = html.slice(child.openEnd, child.closeStart);
      if (/<h[1-6]\b/i.test(inner)) continue;
      const buttons = inner.match(/<button\b/gi)?.length ?? 0;
      const selects = inner.match(/<select\b/gi)?.length ?? 0;
      const paragraphs = [...inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => visible(item[1] ?? ""));
      if (paragraphs.some((paragraph) => paragraph.length > 100)) continue;
      if (buttons >= 2) {
        push("COOKIE", "MEDIUM", "DOCUMENT_POSITION", child.start, boundedEnd(child, html), []);
      } else if (selects >= 1 && visible(inner).length <= 80) {
        push("UTILITY", "MEDIUM", "DOCUMENT_POSITION", child.start, boundedEnd(child, html), []);
      }
    }
  }

  const clusters: Array<{ start: number; end: number; labels: string[]; breadcrumb: boolean; protected: boolean }> = [];
  for (const node of nodes) {
    if (node.tag !== "ul" && node.tag !== "ol") continue;
    if (ancestor(nodes, nodes.indexOf(node), (parent) => parent.tag === "nav" || parent.tag === "header" || parent.tag === "footer")) {
      const shape = listShape(html, node);
      if (shape.labels.length >= 2 && (node.tag === "ul" || node.tag === "ol") && ancestor(nodes, nodes.indexOf(node), (parent) => parent.tag === "footer" || roleOf(parent.attrs) === "contentinfo")) {
        push("LEGAL", "HIGH", "LANDMARK", node.start, boundedEnd(node, html), shape.labels);
      }
      continue;
    }
    const shape = listShape(html, node);
    if (!shape.cluster && !shape.breadcrumb) continue;
    clusters.push({
      start: node.start,
      end: boundedEnd(node, html),
      labels: shape.labels,
      breadcrumb: shape.breadcrumb,
      protected: ownedByProduct(products, node.start),
    });
  }

  const anchors = nodes
    .map((node) => ({ node, label: shortAnchor(html, node) }))
    .filter((item): item is { node: Node; label: string } => Boolean(item.label));
  let run: Array<{ node: Node; label: string }> = [];
  let runSeparated = false;
  const flushRun = () => {
    if (run.length >= 3) {
      const insideList = ancestor(
        nodes,
        nodes.indexOf(run[0].node),
        (parent) => parent.tag === "ul" || parent.tag === "ol" || parent.tag === "nav",
      );
      if (!insideList) {
        clusters.push({
          start: run[0].node.start,
          end: run[run.length - 1].node.end,
          labels: run.map((item) => item.label),
          breadcrumb: runSeparated,
          protected: ownedByProduct(products, run[0].node.start),
        });
      }
    }
    run = [];
    runSeparated = false;
  };
  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    if (run.length === 0) {
      run.push(current);
      continue;
    }
    const previous = run[run.length - 1];
    if (gapIsSeparator(html, previous.node.end, current.node.start)) {
      if (/[›»/]/.test(html.slice(previous.node.end, current.node.start))) runSeparated = true;
      run.push(current);
    } else {
      flushRun();
      run.push(current);
    }
  }
  flushRun();

  const fingerprints = new Map<string, number>();
  for (const cluster of clusters) {
    if (cluster.protected || cluster.labels.length < 3) continue;
    const key = cluster.labels.map((label) => label.toLowerCase()).join("|");
    fingerprints.set(key, (fingerprints.get(key) ?? 0) + 1);
  }

  for (const cluster of clusters) {
    const key = cluster.labels.map((label) => label.toLowerCase()).join("|");
    const repeated = cluster.labels.length >= 3 && (fingerprints.get(key) ?? 0) > 1;
    if (cluster.protected && !repeated) continue;
    const classification: StructuralClass = cluster.breadcrumb ? "BREADCRUMB" : navClass();
    const origin: BoundaryOrigin = repeated && cluster.protected ? "REPETITION" : cluster.breadcrumb ? "DOCUMENT_POSITION" : "LINK_CLUSTER";
    push(classification, "HIGH", origin, cluster.start, cluster.end, cluster.labels);
  }

  const indexOf = new Map<Node, number>();
  nodes.forEach((node, index) => indexOf.set(node, index));
  const byParent = new Map<number, Node[]>();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.parent < 0) continue;
    const list = byParent.get(node.parent) ?? [];
    list.push(node);
    byParent.set(node.parent, list);
  }

  for (const [parentIndex, children] of byParent) {
    const parent = nodes[parentIndex];
    if (!parent || parent.tag === "body" || parent.tag === "html") continue;
    let group: Array<{ node: Node; cells: Array<{ node: Node; text: string; kind: "short" | "decorative" | "statement" | "boolean" | "evidence" }> }> = [];
    const flushGroup = () => {
      if (group.length >= 2) {
        const dataValues = group.slice(1).flatMap((row) => row.cells.slice(1));
        const marked = dataValues.filter((cell) => cell.kind === "boolean" || cell.kind === "decorative").length;
        if (dataValues.length > 0 && marked / dataValues.length >= 0.6) {
          push(
            "COMPARISON_TABLE",
            "HIGH",
            "DOCUMENT_POSITION",
            group[0].node.start,
            group[group.length - 1].node.end,
            [],
          );
          group.forEach((row, rowIndex) => {
            row.cells.forEach((cell, cellIndex) => {
              if (rowIndex === 0) {
                push("COMPARISON_HEADER", "HIGH", "DOCUMENT_POSITION", cell.node.start, cell.node.end, [cell.text].filter(Boolean));
              } else if (cellIndex === 0) {
                push("COMPARISON_ROW_LABEL", "HIGH", "DOCUMENT_POSITION", cell.node.start, cell.node.end, [cell.text].filter(Boolean));
              } else if (cell.kind === "decorative") {
                push("DECORATIVE_CELL", "HIGH", "DOCUMENT_POSITION", cell.node.start, cell.node.end, []);
              } else if (cell.kind === "statement") {
                push("PRODUCT_CONTENT", "MEDIUM", "DOCUMENT_POSITION", cell.node.start, cell.node.end, [cell.text]);
              } else {
                push("COMPARISON_VALUE", "HIGH", "DOCUMENT_POSITION", cell.node.start, cell.node.end, [cell.text].filter(Boolean));
              }
            });
          });
        }
      }
      group = [];
    };
    for (const child of children) {
      const inner = byParent.get(indexOf.get(child) ?? -1) ?? [];
      const cells = comparisonCells(html, inner);
      if (!cells) {
        flushGroup();
        continue;
      }
      if (group.length > 0 && Math.abs(cells.length - group[0].cells.length) > 1) flushGroup();
      group.push({ node: child, cells });
    }
    flushGroup();
  }

  for (const range of products) {
    push(range.classification, "HIGH", "HEADING_OWNERSHIP", range.start, range.end, [range.title]);
  }

  const main = nodes.find((node) => node.tag === "main" || roleOf(node.attrs) === "main");
  if (main) {
    push("PRODUCT_CONTENT", "HIGH", "LANDMARK", main.start, boundedEnd(main, html), []);
  }

  return sections.sort((a, b) => a.start - b.start || a.end - b.end);
}

function linkLabelsInside(html: string, node: Node): string[] {
  const inner = html.slice(node.openEnd, Math.min(node.closeStart, node.openEnd + 4000));
  const labels: string[] = [];
  for (const anchor of inner.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = visible(anchor[1] ?? "");
    const words = text.split(/\s+/).filter(Boolean);
    if (text && text.length <= 48 && words.length <= 6 && !/[.?!]/.test(text)) labels.push(text);
  }
  return labels;
}

function excisionRanges(sections: ContentSection[]): Array<{ start: number; end: number }> {
  const structural = sections
    .filter((section) => isStructuralClass(section.classification))
    .map((section) => ({ start: section.start, end: section.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of structural) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

export function sectionOwning(sections: ContentSection[], offset: number): ContentSection | undefined {
  const hits = sections.filter((section) => offset >= section.start && offset < section.end);
  hits.sort((a, b) => a.end - a.start - (b.end - b.start));
  return hits[0];
}

export function htmlWithoutPageStructure(rawHtml: string): string {
  const html = withoutEmbedded(rawHtml);
  const sections = classifyContentBoundaries(html);
  const ranges = excisionRanges(sections).sort((a, b) => b.start - a.start);
  let next = html;
  for (const range of ranges) {
    next = `${next.slice(0, range.start)} ${next.slice(range.end)}`;
  }
  return next;
}
