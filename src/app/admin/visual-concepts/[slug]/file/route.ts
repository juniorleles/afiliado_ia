import { readFileSync } from "node:fs";
import path from "node:path";
import { requireAdmin } from "@/lib/admin-auth";
import { readRun, visualDesignRoot } from "@/lib/visual-concept/store";
import type { VisualDirectionKey } from "@/lib/visual-concept/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await context.params;
  const url = new URL(request.url);
  const run = url.searchParams.get("run") || "";
  const direction = url.searchParams.get("direction") || "";
  if (direction !== "a" && direction !== "b" && direction !== "c") {
    return new Response("not found", { status: 404 });
  }
  const stored = readRun(visualDesignRoot(), slug, run);
  const concept = stored?.concepts.find((item) => item.key === (direction as VisualDirectionKey));
  if (!stored || !concept) return new Response("not found", { status: 404 });
  const root = path.resolve(visualDesignRoot(), slug, "runs") + path.sep;
  const file = path.resolve(concept.imageFile);
  if (!file.startsWith(root)) return new Response("not found", { status: 404 });
  const bytes = readFileSync(file);
  const type = concept.metadata.format === "png" ? "image/png" : concept.metadata.format === "webp" ? "image/webp" : "image/jpeg";
  return new Response(bytes, { headers: { "content-type": type, "cache-control": "private, no-store" } });
}
