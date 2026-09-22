import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";
import { applyDesignToCampaign, runVisualOptimization } from "@/lib/design/optimize";
import { isHeroVariant, isVisualTheme } from "@/lib/design/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  let body: { slug?: string; action?: string; theme?: string; heroVariant?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug || !getCampaignBySlug(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const theme = isVisualTheme(body.theme) ? body.theme : undefined;
  const heroVariant = isHeroVariant(body.heroVariant) ? body.heroVariant : undefined;
  const action = body.action === "optimize" ? "optimize" : "apply";

  try {
    if (action === "optimize") {
      const result = await runVisualOptimization(slug, { theme });
      return NextResponse.json({
        result: {
          iterations: result.iterations,
          earlyStop: result.earlyStop,
          aiUsedForPlanning: result.aiUsedForPlanning,
          theme: result.plan.visualTheme,
          heroVariant: result.plan.heroVariant,
          visualGate: result.after?.status ?? null,
          contentGate: result.after?.contentGate ?? result.before?.contentGate ?? null,
          highAfter: result.after?.highPriority.length ?? 0,
          productAssetStatus: result.plan.productAssetStatus,
          productAssetProvenance: result.plan.productAssetProvenance,
        },
        report: result.after,
      });
    }
    const applied = await applyDesignToCampaign(slug, { theme, heroVariant });
    return NextResponse.json({
      result: {
        iterations: 0,
        earlyStop: "APPLIED",
        aiUsedForPlanning: false,
        theme: applied.plan.visualTheme,
        heroVariant: applied.plan.heroVariant,
        productAssetStatus: applied.plan.productAssetStatus,
        productAssetProvenance: applied.plan.productAssetProvenance,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "design failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
