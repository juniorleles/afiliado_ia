import type { Metadata } from "next";
import Link from "next/link";
import { PageTemplate } from "@/components/layout/page-template";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listCampaigns } from "@/lib/campaigns";
import { LANGUAGES, labelFor, readCampaignBrief } from "@/lib/campaign-brief";
import { campaignHasLanding, landingDocumentCampaignIds, landingTitle } from "@/lib/landing-catalog";
import { ScrollToLanding } from "@/app/admin/landing-pages/scroll-to-landing";

export const metadata: Metadata = { title: "Landing pages" };
export const dynamic = "force-dynamic";

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

export default async function LandingPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ selecionada?: string }>;
}) {
  const selectedId = Number((await searchParams).selecionada);
  const documents = landingDocumentCampaignIds();
  const rows = listCampaigns().filter((campaign) => campaignHasLanding(campaign, documents)).map((campaign) => {
    const brief = readCampaignBrief(campaign.id);
    return {
      id: campaign.id,
      title: landingTitle(campaign),
      campaign: campaign.name,
      language: brief ? labelFor(LANGUAGES, brief.language) : "Não informado",
      published: campaign.publicationStatus === "published",
      updatedAt: formatUpdated(campaign.updatedAt),
    };
  });

  return (
    <PageTemplate
      title="Landing pages"
      description="Páginas já gravadas nas campanhas. Cada campanha aparece aqui com a sua landing atual."
      primaryAction={null}
    >
      {Number.isInteger(selectedId) && selectedId > 0 ? <ScrollToLanding id={selectedId} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          icon="landingPage"
          title="Nenhuma landing page"
          description="Quando uma campanha tiver uma página, ela aparece nesta lista."
        />
      ) : (
        <div className="overflow-x-auto rounded-ds-md border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-body">
            <thead className="text-caption text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Nome</th>
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Campanha</th>
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Versão</th>
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Idioma</th>
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Status</th>
                <th className="px-ds-16 py-ds-12 font-medium" scope="col">Atualização</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selected = row.id === selectedId;
                return (
                <tr key={row.id} id={`landing-${row.id}`} className={selected ? "border-b border-border bg-secondary last:border-b-0" : "border-b border-border last:border-b-0"} aria-selected={selected}>
                  <th className="px-ds-16 py-ds-12 font-medium" scope="row">
                    <Link href={`/admin/landing-pages/${row.id}`} className="text-primary-text hover:underline">
                      {row.title}
                    </Link>
                    {selected ? <p className="text-caption text-muted-foreground">Selecionada</p> : null}
                  </th>
                  <td className="px-ds-16 py-ds-12">{row.campaign}</td>
                  <td className="px-ds-16 py-ds-12">V1</td>
                  <td className="px-ds-16 py-ds-12">{row.language}</td>
                  <td className="px-ds-16 py-ds-12">
                    <Badge tone={row.published ? "success" : "warning"}>{row.published ? "Publicada" : "Rascunho"}</Badge>
                  </td>
                  <td className="px-ds-16 py-ds-12">{row.updatedAt}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageTemplate>
  );
}
