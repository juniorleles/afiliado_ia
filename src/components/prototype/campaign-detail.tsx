"use client";

import { PageIntro, PrimaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prototypeAds, prototypeCampaign, prototypeProduct } from "@/lib/prototype/mock";

export function CampaignDetail() {
  return (
    <>
      <PageIntro
        title={prototypeCampaign.name}
        lede="Rascunho. Publicar a presell não envia o Ad."
        action={<PrimaryLink href="/prototype/relatorios">Concluir revisão</PrimaryLink>}
      />
      <Badge tone="review">{prototypeCampaign.status}</Badge>
      <Tabs defaultValue="presell" className="mt-6">
        <TabsList>
          <TabsTrigger value="presell">Presell</TabsTrigger>
          <TabsTrigger value="ad">Ad</TabsTrigger>
          <TabsTrigger value="publish">Publicação</TabsTrigger>
        </TabsList>
        <TabsContent value="presell">
          <Card>
            <CardContent>
              <CardTitle>Prévia</CardTitle>
              <h2 className="mt-3 text-[22px] font-semibold">{prototypeProduct.name}</h2>
              <p className="mt-2 text-sm leading-6">
                {prototypeProduct.brand} lists {prototypeProduct.name} at {prototypeProduct.price}.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ad">
          <p className="mb-4 text-sm">Nada foi enviado.</p>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent>
                <CardTitle>Campanha</CardTitle>
                <p className="mt-2 font-semibold">Pausada</p>
                <p className="mt-1 text-sm">{prototypeCampaign.name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <CardTitle>Grupo</CardTitle>
                <p className="mt-2 font-semibold">Pausado</p>
                <p className="mt-1 text-sm">Busca</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <CardTitle>Ad</CardTitle>
                <p className="mt-2 font-semibold">Pausado</p>
                <p className="mt-3 text-xs text-muted-foreground">Headlines</p>
                <ul className="mt-1 text-sm">
                  {prototypeAds.headlines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">Descriptions</p>
                <ul className="mt-1 text-sm">
                  {prototypeAds.descriptions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="publish">
          <p className="max-w-xl text-sm leading-6">
            A publicação da presell é uma decisão separada. Este protótipo não publica a página e não envia o Ad.
          </p>
        </TabsContent>
      </Tabs>
      <TechnicalDetails />
    </>
  );
}
