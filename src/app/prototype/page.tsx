import Link from "next/link";
import { PageIntro, PrimaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { prototypeCampaign, prototypeProduct, prototypeSearch } from "@/lib/prototype/mock";

const CARDS = [
  { label: "Pesquisas", value: "1", href: "/prototype/pesquisa", action: "Abrir" },
  { label: "Products sem campanha", value: "2", href: "/prototype/produto", action: "Escolher Product" },
  { label: "Rascunhos", value: "1", href: "/prototype/campanhas/joint-pain-test", action: "Abrir" },
  { label: "Ações por aprovar", value: "1", href: "/prototype/relatorios", action: "Revisar" },
];

export default function DashboardPage() {
  return (
    <>
      <PageIntro
        title="Trabalho em aberto"
        lede={`A última pesquisa foi ${prototypeSearch.keyword}. O Product em análise é ${prototypeProduct.name}.`}
        action={<PrimaryLink href="/prototype/pesquisa/resultado">Continuar</PrimaryLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => (
          <Card key={card.label}>
            <CardContent>
              <CardTitle>{card.label}</CardTitle>
              <p className="mt-2 text-[28px] font-semibold leading-9 tabular-nums">{card.value}</p>
              <Link href={card.href} className="mt-3 inline-flex text-sm text-[#175CD3] underline-offset-2 hover:underline">
                {card.action}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardContent>
          <p className="text-sm font-semibold">{prototypeCampaign.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">Próximo passo: {prototypeCampaign.next}</p>
        </CardContent>
      </Card>
      <TechnicalDetails />
    </>
  );
}
