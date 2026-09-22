import { parseMarkdown } from "@/lib/markdown";

export function presellMetaDescription(headline: string, body: string): string {
  const blocks = parseMarkdown(body);
  const firstPara = blocks.find((block) => block.type === "paragraph");
  const source = firstPara && firstPara.type === "paragraph" ? firstPara.text : headline;
  const collapsed = source.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 160) return collapsed;
  return `${collapsed.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
