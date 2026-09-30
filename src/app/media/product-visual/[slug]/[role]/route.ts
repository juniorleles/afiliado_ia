import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { productVisualFile } from "@/lib/product-visual/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; role: string }> },
) {
  const { slug, role } = await context.params;
  const file = productVisualFile(slug, role);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(readFileSync(file)), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-aia-visual-authority": "source-product",
    },
  });
}
