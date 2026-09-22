import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";
import { attachManualProductAsset, clearProductAsset } from "@/lib/assets/attach";
import { applyDesignToCampaign } from "@/lib/design/optimize";
import { runVisualQaForSlug } from "@/lib/visual-qa/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const type = request.headers.get("content-type") || "";
  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    const slug = String(form.get("slug") || "").trim();
    const action = String(form.get("action") || "upload");
    const campaign = slug ? getCampaignBySlug(slug) : undefined;
    if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
    try {
      if (action === "remove") {
        const result = await clearProductAsset(campaign);
        return NextResponse.json({
          result: {
            productAssetStatus: result.plan.productAssetStatus,
            productAssetProvenance: result.plan.productAssetProvenance,
            heroVariant: result.plan.heroVariant,
          },
        });
      }
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await attachManualProductAsset(campaign, buffer, file.type);
      return NextResponse.json({
        result: {
          productAssetStatus: result.plan.productAssetStatus,
          productAssetProvenance: result.plan.productAssetProvenance,
          heroVariant: result.plan.heroVariant,
          src: result.campaign.productImageSrc,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "upload failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  let body: { slug?: string; action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const campaign = slug ? getCampaignBySlug(slug) : undefined;
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (body.action === "remove") {
    const result = await clearProductAsset(campaign);
    return NextResponse.json({ result: { productAssetStatus: result.plan.productAssetStatus } });
  }
  if (body.action === "rebuild") {
    const applied = await applyDesignToCampaign(slug);
    const report = await runVisualQaForSlug(slug, true);
    return NextResponse.json({
      result: {
        productAssetStatus: applied.plan.productAssetStatus,
        heroVariant: applied.plan.heroVariant,
      },
      report,
    });
  }
  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}
