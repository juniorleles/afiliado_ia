import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { getCampaignBySlug } from "@/lib/campaigns";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";
import { runVisualQaForSlug } from "@/lib/visual-qa/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  const campaign = getCampaignBySlug(slug);
  if (!campaign) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const report = getLatestVisualQaReport(campaign.id);
  return NextResponse.json({ report });
}

export async function POST(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  let slug = "";
  try {
    const body = (await request.json()) as { slug?: string };
    slug = typeof body.slug === "string" ? body.slug.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  if (!getCampaignBySlug(slug)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const report = await runVisualQaForSlug(slug, true);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "visual qa failed" }, { status: 500 });
  }
}
