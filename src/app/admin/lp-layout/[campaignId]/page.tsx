import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { buildGeneratedLayout, resolveLayout, type LayoutAssignment } from "@/lib/lp-builder/layout";
import { listLayoutAudit, listLayoutOverrides } from "@/lib/lp-builder/layout-store";
import { parsePresellPage } from "@/lib/presell-page";
import { LayoutEditor } from "@/app/admin/lp-layout/[campaignId]/layout-editor";

function presentSections(page: ReturnType<typeof parsePresellPage>): string[] {
  const present = ["hero", "pricing", "disclosure", "navigation", "footer", "closingCta"];
  for (const section of page?.sections ?? []) {
    if (section.id === "considerations") present.push("warnings");
    else if (section.id === "features" || section.id === "ingredients" || section.id === "guarantee" || section.id === "faq") present.push(section.id);
  }
  return present;
}

export default async function LayoutBuilderPage({ params }: { params: Promise<{ campaignId: string }> }) {
  await requireAdmin();
  const id = Number((await params).campaignId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const campaign = getCampaignById(id);
  if (!campaign) notFound();
  const page = parsePresellPage(campaign.pageComposition);
  const generated = buildGeneratedLayout(presentSections(page));
  const assignments: LayoutAssignment[] = listLayoutOverrides(campaign.id).map((row) => ({
    sectionKey: row.sectionKey,
    sectionId: row.sectionId,
    visible: row.visible,
    collapsed: row.collapsed,
    order: row.order,
    priority: row.priority,
    pinned: row.pinned,
    locked: row.locked,
    futureCompatible: row.futureCompatible,
    duplicate: row.duplicate,
  }));
  const snippets: Record<string, string> = {};
  if (page) {
    snippets.hero = page.hero.headline;
    snippets.disclosure = page.hero.summary;
    snippets.closingCta = page.ctaLabel;
    for (const section of page.sections) {
      const key = section.id === "considerations" ? "warnings" : section.id;
      snippets[key] = [section.title, ...section.paragraphs].filter(Boolean).join(" ");
    }
  }

  return (
    <div data-preview-wide className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Layout Builder</p>
          <h2 className="mt-1 text-2xl font-semibold">{campaign.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Layout overrides change section order and visibility. Generated copy stays in place.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/admin/lp-builder/${campaign.id}`} className="text-emerald-400 hover:underline">LP Builder</Link>
          <Link href={`/admin/preview/${campaign.slug}`} className="text-emerald-400 hover:underline">Preview</Link>
          <Link href="/admin" className="text-zinc-300 hover:underline">Admin</Link>
        </div>
      </div>
      <LayoutEditor campaignId={campaign.id} generated={generated} initial={resolveLayout({ generated, assignments }).sections} snippets={snippets} initialAudit={listLayoutAudit(campaign.id)} />
    </div>
  );
}
