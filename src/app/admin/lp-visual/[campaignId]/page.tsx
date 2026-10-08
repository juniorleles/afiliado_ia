import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getCampaignById } from "@/lib/campaigns";
import { builderEditorState } from "@/lib/lp-content-render";
import { isThemeToken, isVisualSection, VISUAL_SECTIONS, type ThemeTokenOverride, type VisualSectionId } from "@/lib/lp-builder/theme";
import { listThemeAudit, listThemeOverrides } from "@/lib/lp-builder/theme-store";
import { VisualEditor } from "@/app/admin/lp-visual/[campaignId]/visual-editor";

const FIELD_LINES: Array<[string, VisualSectionId, string]> = [
  ["hero.headline", "hero", "heading"],
  ["hero.subheadline", "hero", "body"],
  ["hero.cta", "hero", "button"],
  ["section.features.title", "features", "heading"],
  ["features.item.0.title", "features", "card"],
  ["section.ingredients.title", "ingredients", "heading"],
  ["ingredients.item.0.title", "ingredients", "card"],
  ["section.pricing.title", "pricing", "heading"],
  ["pricing.item.0.title", "pricing", "card"],
  ["pricing.cta", "pricing", "button"],
  ["section.faq.title", "faq", "heading"],
  ["faq.item.0.question", "faq", "question"],
  ["section.guarantee.title", "guarantee", "heading"],
  ["guarantee.body", "guarantee", "body"],
  ["warnings.body", "warnings", "body"],
  ["manufacturer.body", "manufacturer", "body"],
  ["footer.body", "footer", "body"],
  ["nav.overview", "footer", "link"],
  ["closing.cta", "closingCta", "button"],
];

export default async function VisualEditorPage({
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
  const { fields } = builderEditorState(campaign);
  const rows = listThemeOverrides(campaign.id);
  const saved: ThemeTokenOverride[] = rows.flatMap((row) => {
    if ((row.scope !== "theme" && row.scope !== "section" && row.scope !== "component") || !isThemeToken(row.token)) return [];
    if (row.scope === "section" && !isVisualSection(row.targetId)) return [];
    return [{ scope: row.scope, targetId: row.targetId, token: row.token, value: row.value }];
  });
  const lines = FIELD_LINES.flatMap(([fieldId, section, component]) => {
    const text = fields.find((field) => field.id === fieldId)?.effective ?? "";
    return text.trim() && (VISUAL_SECTIONS as readonly string[]).includes(section) ? [{ section, component, text }] : [];
  });

  return (
    <div data-preview-wide className="space-y-6">
      {embedded ? null : <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">Visual Editor</p>
          <h2 className="mt-1 text-2xl font-semibold">{campaign.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Theme overrides change presentation. Generated copy stays in place.</p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href={`/admin/lp-builder/${campaign.id}`} className="text-emerald-400 hover:underline">LP Builder</Link>
          <Link href={`/admin/preview/${campaign.slug}`} className="text-emerald-400 hover:underline">Preview</Link>
          <Link href="/admin" className="text-zinc-300 hover:underline">Admin</Link>
        </div>
      </div>}
      <VisualEditor campaignId={campaign.id} saved={saved} lines={lines} initialAudit={listThemeAudit(campaign.id)} />
    </div>
  );
}
