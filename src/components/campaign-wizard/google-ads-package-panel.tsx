import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { AdText, GoogleAdsPackage } from "@/lib/google-ads-generation/types";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-ds-12">
      <h3 id={id} className="text-h3">{title}</h3>
      {children}
    </section>
  );
}

function lines(items: AdText[]) {
  if (items.length === 0) return <p className="text-body text-muted-foreground">Nenhum texto sustentado.</p>;
  return (
    <ul className="flex flex-col gap-ds-8">
      {items.map((item) => (
        <li key={item.text} className="text-body">
          {item.text} <span className="text-caption text-muted-foreground">{item.text.length}</span>
        </li>
      ))}
    </ul>
  );
}

export function GoogleAdsPackagePanel({ bundle }: { bundle: GoogleAdsPackage | null }) {
  if (!bundle) return <p className="text-body text-muted-foreground">Não encontrado durante a pesquisa.</p>;
  const previewHeads = bundle.headlines.slice(0, 3).map((item) => item.text).join(" | ");
  const groups = [
    ["Marca", bundle.keywords.brand],
    ["Comerciais", bundle.keywords.commercial],
    ["Problema", bundle.keywords.problem],
    ["Cauda longa", bundle.keywords.longTail],
  ] as const;
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-32 p-ds-16">
        <Block id="ads-forca" title="Asset Strength">
          <p className="text-h3">{bundle.assetStrength.score} · {bundle.assetStrength.label}</p>
          <p className="text-caption text-muted-foreground">
            {bundle.headlines.length} títulos · {bundle.descriptions.length} descrições · {bundle.sitelinks.length} sitelinks · {bundle.callouts.length} callouts
          </p>
          {bundle.approachId ? <p className="text-body">Decisão {bundle.approachId}</p> : null}
        </Block>
        <Block id="ads-policy" title="Policy">
          <p className="text-body">{bundle.policy.status === "PASS" ? "Sem claim proibido no pacote." : "O pacote tem pendência de política."}</p>
          {bundle.policy.issues.length > 0 ? (
            <ul className="flex flex-col gap-ds-8">
              {bundle.policy.issues.map((item) => <li key={item} className="text-body">{item}</li>)}
            </ul>
          ) : null}
          {bundle.warnings.length > 0 ? (
            <ul className="flex flex-col gap-ds-8">
              {bundle.warnings.map((item) => <li key={item} className="text-caption text-muted-foreground">{item}</li>)}
            </ul>
          ) : null}
        </Block>
        <Block id="ads-preview" title="Preview">
          <p className="text-body">{previewHeads || "Sem título"}</p>
          <p className="text-body">{bundle.displayUrl}</p>
          <p className="text-caption text-muted-foreground">{bundle.displayPaths[0]} / {bundle.displayPaths[1]}</p>
          <p className="text-body">{bundle.descriptions[0]?.text || "Sem descrição"}</p>
          <p className="text-caption text-muted-foreground">URL final {bundle.finalUrl}</p>
        </Block>
        <Block id="ads-headlines" title="RSA Headlines">
          {lines(bundle.headlines)}
        </Block>
        <Block id="ads-descriptions" title="RSA Descriptions">
          {lines(bundle.descriptions)}
        </Block>
        <Block id="ads-sitelinks" title="Sitelinks">
          {bundle.sitelinks.length === 0 ? <p className="text-body text-muted-foreground">Nenhum sitelink sustentado.</p> : (
            <ul className="flex flex-col gap-ds-8">
              {bundle.sitelinks.map((item) => (
                <li key={item.text} className="text-body">{item.text}{item.description ? ` · ${item.description}` : ""}</li>
              ))}
            </ul>
          )}
        </Block>
        <Block id="ads-callouts" title="Callouts">
          {lines(bundle.callouts)}
        </Block>
        <Block id="ads-snippets" title="Structured Snippets">
          {bundle.structuredSnippets.length === 0 ? <p className="text-body text-muted-foreground">Nenhum snippet sustentado.</p> : bundle.structuredSnippets.map((item) => (
            <p key={item.header} className="text-body">{item.header}: {item.values.map((value) => value.text).join(", ")}</p>
          ))}
        </Block>
        <Block id="ads-keywords" title="Keywords">
          {groups.map(([label, items]) => (
            <div key={label}>
              <h4 className="text-body">{label}</h4>
              {items.length === 0 ? <p className="text-caption text-muted-foreground">Nenhuma.</p> : (
                <ul className="flex flex-col gap-ds-8">
                  {items.map((item) => <li key={`${label}-${item}`} className="text-body">{item}</li>)}
                </ul>
              )}
            </div>
          ))}
        </Block>
        <Block id="ads-negatives" title="Negative Keywords">
          <ul className="flex flex-col gap-ds-8">
            {bundle.negativeKeywords.map((item) => <li key={item} className="text-body">{item}</li>)}
          </ul>
        </Block>
      </CardContent>
    </Card>
  );
}
