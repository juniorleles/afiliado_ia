import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

export const RECOVER_54BA_FILES = [
  "src/app/premium-design-engine.css",
  "src/components/design-system/premium-blocks.tsx",
  "src/components/product-showcase/v4/page.tsx",
] as const;

export const RECOVER_54BA_MARKERS = {
  css: 'grid-template-areas: "copy pack rail"',
  blocks: "premium-cta__arrow",
  page: "data-premium-pack",
} as const;

const DEFAULT_TRANSCRIPT = path.join(
  process.env.USERPROFILE ?? "",
  ".cursor",
  "projects",
  "c-workspace-afiliado-ia",
  "agent-transcripts",
  "8c95a7f3-647e-472c-b913-e17008c2e57b",
  "8c95a7f3-647e-472c-b913-e17008c2e57b.jsonl",
);

type ToolCall = { name: string; input: Record<string, unknown> };

function posix(relative: string): string {
  return relative.replace(/\\/g, "/");
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function gitShow(commit: string, relative: string, root: string): string {
  return execSync(`git show ${commit}:${relative}`, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function collectToolCalls(line: string): ToolCall[] {
  const out: ToolCall[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return out;
  }
  const message = (parsed as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (!Array.isArray(content)) return out;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const rec = item as { type?: string; name?: string; input?: Record<string, unknown> };
    if (rec.type === "tool_use" && rec.name && rec.input) out.push({ name: rec.name, input: rec.input });
  }
  return out;
}

function applyReplace(source: string, oldString: string, newString: string, replaceAll = false): string | null {
  if (replaceAll) {
    if (!source.includes(oldString)) return null;
    return source.split(oldString).join(newString);
  }
  const index = source.indexOf(oldString);
  if (index < 0) return null;
  return source.slice(0, index) + newString + source.slice(index + oldString.length);
}

export function recover54baComposition(input: {
  root?: string;
  transcriptPath?: string;
  baseCommit?: string;
}): {
  complete: boolean;
  reason: string;
  files: Array<{ path: string; contents: string; sha256: string }>;
  markers: Record<string, boolean>;
} {
  const root = input.root ?? process.cwd();
  const transcriptPath = input.transcriptPath ?? DEFAULT_TRANSCRIPT;
  const baseCommit = input.baseCommit ?? "08a2a4d3b34220aaa8be6865b76840eb5ebb8a66";
  if (!existsSync(transcriptPath)) {
    return { complete: false, reason: `Transcript not found: ${transcriptPath}`, files: [], markers: {} };
  }
  const files = new Map<string, string>();
  for (const relative of RECOVER_54BA_FILES) {
    files.set(relative, gitShow(baseCommit, relative, root));
  }
  const raw = readFileSync(transcriptPath, "utf8");
  let sawCssWrite = false;
  let sawBlocksPatch = false;
  let sawPagePatch = false;
  for (const line of raw.split(/\n/)) {
    if (!line.includes("premium-design-engine.css") && !line.includes("premium-blocks.tsx") && !line.includes("product-showcase\\\\v4\\\\page.tsx") && !line.includes("product-showcase/v4/page.tsx")) {
      continue;
    }
    for (const call of collectToolCalls(line)) {
      const filePath = typeof call.input.path === "string" ? posix(call.input.path.replace(/\\/g, "/")) : "";
      const relative = RECOVER_54BA_FILES.find((item) => filePath.endsWith(item));
      if (!relative) continue;
      if (call.name === "Write" && typeof call.input.contents === "string") {
        files.set(relative, call.input.contents);
        if (relative.endsWith("premium-design-engine.css")) sawCssWrite = true;
        if (relative.endsWith("premium-blocks.tsx")) sawBlocksPatch = true;
        if (relative.endsWith("page.tsx")) sawPagePatch = true;
      }
      if (call.name === "StrReplace" && typeof call.input.old_string === "string" && typeof call.input.new_string === "string") {
        const current = files.get(relative);
        if (current == null) continue;
        const next = applyReplace(current, call.input.old_string, call.input.new_string, call.input.replace_all === true);
        if (next == null) continue;
        files.set(relative, next);
        if (relative.endsWith("premium-blocks.tsx")) sawBlocksPatch = true;
        if (relative.endsWith("page.tsx")) sawPagePatch = true;
      }
    }
  }
  const recovered = RECOVER_54BA_FILES.map((relative) => {
    const contents = files.get(relative) ?? "";
    return { path: relative, contents, sha256: hashText(contents) };
  });
  const markers = {
    css: recovered[0]!.contents.includes(RECOVER_54BA_MARKERS.css),
    blocks: recovered[1]!.contents.includes(RECOVER_54BA_MARKERS.blocks),
    page: recovered[2]!.contents.includes(RECOVER_54BA_MARKERS.page),
  };
  const complete = sawCssWrite && sawBlocksPatch && sawPagePatch && markers.css && markers.blocks && markers.page;
  return {
    complete,
    reason: complete
      ? "Recovered 54BA composition from recorded Write/StrReplace tool calls."
      : `Recovery incomplete. cssWrite=${sawCssWrite} blocksPatch=${sawBlocksPatch} pagePatch=${sawPagePatch} markers=${JSON.stringify(markers)}`,
    files: recovered,
    markers,
  };
}

export function applyRecovered54baFiles(
  files: Array<{ path: string; contents: string }>,
  root = process.cwd(),
): string[] {
  const written: string[] = [];
  for (const file of files) {
    const absolute = path.join(root, file.path);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, file.contents);
    written.push(file.path);
  }
  return written;
}
