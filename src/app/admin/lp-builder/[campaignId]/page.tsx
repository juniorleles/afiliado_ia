import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { CONTENT_LIMITS } from "@/lib/lp-builder/content";
import { builderEditorState } from "@/lib/lp-content-render";
import { BuilderEditor } from "@/app/admin/lp-builder/[campaignId]/builder-editor";

export default async function LandingPageBuilderPage({
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
  const { fields, audit } = builderEditorState(campaign);

  return (
    <div data-preview-wide className="space-y-6">
      {embedded ? null : <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Landing Page Builder</p>
          <h2 className="mt-1 text-2xl font-semibold">{campaign.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Generated copy stays the source. A builder override changes only the effective text on the page.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-zinc-200">Content Editor</span>
          <Link href={`/admin/lp-visual/${campaign.id}`} className="text-emerald-400 hover:underline">
            Visual Editor
          </Link>
          <Link href={`/admin/lp-media/${campaign.id}`} className="text-emerald-400 hover:underline">
            Media Manager
          </Link>
          <Link href={`/admin/lp-layout/${campaign.id}`} className="text-emerald-400 hover:underline">
            Layout Builder
          </Link>
          <Link href={`/admin/lp-versions/${campaign.id}`} className="text-emerald-400 hover:underline">
            Version History
          </Link>
          <a href="#lp-live-preview" className="text-emerald-400 hover:underline">
            Live Preview
          </a>
          <Link href="/admin" className="text-zinc-300 hover:underline">
            Admin
          </Link>
        </div>
      </div>}
      <BuilderEditor
        campaignId={campaign.id}
        previewHref={`/admin/preview/${campaign.slug}`}
        initialAudit={audit}
        initialFields={fields.map((field) => ({
          id: field.id,
          group: field.group,
          section: field.section,
          label: field.label,
          kind: field.kind,
          generated: field.generated,
          override: field.override,
          effective: field.effective,
          modified: field.modified,
          maxLength: CONTENT_LIMITS[field.kind],
        }))}
      />
    </div>
  );
}
