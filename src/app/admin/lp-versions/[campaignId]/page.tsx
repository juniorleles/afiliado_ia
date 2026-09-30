import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { listPageVersions, versionAutosaveEnabled } from "@/lib/lp-builder/version-store";
import { VersionHistory } from "@/app/admin/lp-versions/[campaignId]/version-history";

export default async function VersionHistoryPage({ params }: { params: Promise<{ campaignId: string }> }) {
  await requireAdmin();
  const id = Number((await params).campaignId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const versions = listPageVersions(campaign.id);

  return (
    <div data-preview-wide className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Version history</p>
          <h2 className="mt-1 text-2xl font-semibold">{campaign.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Each saved state stores builder overrides. The generated landing page stays unchanged.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/admin/lp-builder/${campaign.id}`} className="text-emerald-400 hover:underline">
            LP Builder
          </Link>
          <Link href={`/admin/preview/${campaign.slug}`} className="text-emerald-400 hover:underline">
            Preview
          </Link>
          <Link href="/admin" className="text-zinc-300 hover:underline">
            Admin
          </Link>
        </div>
      </div>
      <VersionHistory
        campaignId={campaign.id}
        previewHref={`/admin/preview/${campaign.slug}`}
        initialAutosave={versionAutosaveEnabled(campaign.id)}
        initialVersions={versions.map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          createdBy: version.createdBy,
          comment: version.comment,
          parentId: version.parentId,
          status: version.status,
          action: version.action,
          affectedSections: version.affectedSections,
          overrideCount: version.overrideCount,
          snapshot: version.snapshot,
          changes: version.changes,
        }))}
      />
    </div>
  );
}
