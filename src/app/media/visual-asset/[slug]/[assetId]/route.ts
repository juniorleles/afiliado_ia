import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { generatedVisualAssetFile } from "@/lib/visual-concept/asset-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; assetId: string }> },
) {
  const { slug, assetId } = await context.params;
  const file = generatedVisualAssetFile(slug, assetId);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(readFileSync(file)), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-aia-visual-authority": "decorative",
    },
  });
}
