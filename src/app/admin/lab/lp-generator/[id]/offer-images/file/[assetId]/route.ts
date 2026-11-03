import { readFileSync, existsSync } from "node:fs";
import { requireAdmin } from "@/lib/admin-auth";
import { readGeneration } from "@/lib/lp-generator/store";
import { readOfferImageInventory, resolveOfferImageDiskPath } from "@/lib/presell-quality/offer-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeOf(mimeType: string | null, file: string): string {
  if (mimeType) return mimeType;
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  await requireAdmin();
  const { id, assetId } = await context.params;
  if (!/^asset-[a-f0-9]+$/i.test(assetId)) {
    return new Response("Not found", { status: 404 });
  }
  const record = readGeneration(id);
  if (!record?.campaignId) return new Response("Not found", { status: 404 });
  const inventory = readOfferImageInventory(record.campaignId);
  const asset = inventory?.assets.find((item) => item.assetId === assetId);
  if (!asset) return new Response("Not found", { status: 404 });
  const disk = resolveOfferImageDiskPath(asset);
  if (!disk || !existsSync(disk)) return new Response("Not found", { status: 404 });
  const body = readFileSync(disk);
  return new Response(body, {
    headers: {
      "content-type": contentTypeOf(asset.mimeType, disk),
      "cache-control": "private, max-age=60",
    },
  });
}
