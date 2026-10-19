import { NextResponse } from "next/server";
import { readApprovedCampaignAsset } from "@/lib/official-assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ campaignId: string; file: string }> },
) {
  const { campaignId, file } = await context.params;
  const id = Number(campaignId);
  if (!Number.isInteger(id) || id < 1) return new NextResponse("Not found", { status: 404 });
  const image = readApprovedCampaignAsset(id, file);
  if (!image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
