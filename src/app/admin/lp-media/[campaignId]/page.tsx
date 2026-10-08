import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { buildMediaSlots, type MediaAssignment } from "@/lib/lp-builder/media";
import { listMediaAudit, listMediaLibrary, listMediaOverrides } from "@/lib/lp-builder/media-store";
import { mediaSeedsFor } from "@/lib/lp-media-render";
import { parsePresellPage } from "@/lib/presell-page";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";
import { MediaEditor } from "@/app/admin/lp-media/[campaignId]/media-editor";

export default async function MediaManagerPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams?: Promise<{ embedded?: string | string[] }>;
}) {
  const embedded = (await searchParams)?.embedded === "studio";
  await requireAdmin();
  const id = Number((await params).campaignId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const page = parsePresellPage(campaign.pageComposition);
  const assets = resolvePresellRenderAssets(campaign);
  const slots = buildMediaSlots(mediaSeedsFor(page, assets));
  const saved: MediaAssignment[] = listMediaOverrides(campaign.id).map((row) => ({
    slotId: row.slotId,
    removed: row.removed,
    reason: row.reason,
    fields: row.fields,
  }));

  return (
    <div data-preview-wide className="space-y-6">
      {embedded ? null : <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Media Manager</p>
          <h2 className="mt-1 text-2xl font-semibold">{campaign.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Asset overrides change the images on the page. Generated copy stays in place.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/admin/lp-builder/${campaign.id}`} className="text-emerald-400 hover:underline">LP Builder</Link>
          <Link href={`/admin/preview/${campaign.slug}`} className="text-emerald-400 hover:underline">Preview</Link>
          <Link href="/admin" className="text-zinc-300 hover:underline">Admin</Link>
        </div>
      </div>}
      <MediaEditor
        campaignId={campaign.id}
        initialSlots={slots}
        saved={saved}
        library={listMediaLibrary(campaign.id)}
        initialAudit={listMediaAudit(campaign.id)}
      />
    </div>
  );
}
