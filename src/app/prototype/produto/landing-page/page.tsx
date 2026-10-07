import { PageIntro, PrimaryLink, SecondaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Card, CardContent } from "@/components/ui/card";
import { prototypeLanding, prototypeProduct } from "@/lib/prototype/mock";

export default function LandingPage() {
  return (
    <>
      <PageIntro
        title="Landing page"
        lede={prototypeProduct.name}
        action={<PrimaryLink href="/prototype/oportunidade">Seguir para a oportunidade</PrimaryLink>}
      />
      <Card>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold">{prototypeLanding.opened}</p>
          <p>{prototypeLanding.address}</p>
          <p>{prototypeLanding.readable}</p>
        </CardContent>
      </Card>
      <article className="mt-6 max-w-2xl rounded-lg border border-border bg-card p-6">
        <h2 className="text-[22px] font-semibold">{prototypeLanding.title}</h2>
        <p className="mt-3 text-sm leading-6">{prototypeLanding.body}</p>
      </article>
      <div className="mt-6">
        <SecondaryLink href="/prototype/produto">Voltar ao Product</SecondaryLink>
      </div>
      <TechnicalDetails />
    </>
  );
}
