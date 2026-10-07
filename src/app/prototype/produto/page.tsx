import { PageIntro, PrimaryLink, SecondaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { prototypeProduct } from "@/lib/prototype/mock";

export default function ProductPage() {
  const facts = [
    { label: "Marca", value: prototypeProduct.brand },
    { label: "Categoria", value: prototypeProduct.category },
    { label: "Preço", value: prototypeProduct.price },
  ];

  return (
    <>
      <PageIntro
        title={prototypeProduct.name}
        lede="Só o que a página sustenta. O que não apareceu fica como não observado."
        action={<PrimaryLink href="/prototype/produto/landing-page">Ver Landing page</PrimaryLink>}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <Card key={fact.label}>
            <CardContent>
              <CardTitle>{fact.label}</CardTitle>
              <p className="mt-2 text-lg font-semibold">{fact.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <h2 className="mb-3 mt-8 text-[22px] font-semibold">O que a página disse</h2>
      <p className="text-sm leading-6">
        Stonehenge Health lists {prototypeProduct.name} at {prototypeProduct.price}.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <SecondaryLink href="/prototype/oportunidade">Ver oportunidade</SecondaryLink>
        <SecondaryLink href="/prototype/campanhas/joint-pain-test">Criar campanha</SecondaryLink>
      </div>
      <TechnicalDetails />
    </>
  );
}
