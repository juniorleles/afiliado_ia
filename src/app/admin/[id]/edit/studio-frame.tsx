"use client";

import Link from "next/link";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { WorkspaceTabs, type WorkspaceTabItem } from "@/app/admin/[id]/edit/workspace-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

const PREVIEW_WIDTH = { desktop: 1280, tablet: 768, mobile: 390 } as const;
type Viewport = keyof typeof PREVIEW_WIDTH;

const BLOCKS = [
  { id: "structure", label: "Estrutura", targets: ["[data-layout-preview]", "#builder-hero", "#hero"] },
  { id: "hero", label: "Hero", targets: ["#builder-hero", "[data-preview-section='hero']", "#hero", "[data-section-id='hero']"] },
  { id: "benefits", label: "Benefícios", targets: ["#builder-features", "[data-preview-section='features']", "#features", "[data-section-id='features']"] },
  { id: "testimonials", label: "Depoimentos", targets: ["[data-preview-section='testimonials']", "[data-section-id='testimonials']"] },
  { id: "faq", label: "FAQ", targets: ["#builder-faq", "[data-preview-section='faq']", "#faq", "[data-section-id='faq']"] },
  { id: "cta", label: "CTA", targets: ["[data-preview-section='closingCta']", "[data-preview-section='pricing']", "#builder-pricing", "[data-section-id='pricing']"] },
  { id: "footer", label: "Rodapé", targets: ["#builder-footer", "[data-preview-section='footer']", "footer"] },
] as const;

type BlockId = (typeof BLOCKS)[number]["id"];

const PROPERTIES: Record<BlockId, Array<{ label: string; tool: string }>> = {
  structure: [
    { label: "Layout", tool: "layout" },
    { label: "Visibilidade", tool: "layout" },
    { label: "Metadados", tool: "builder" },
  ],
  hero: [
    { label: "Tipografia", tool: "visual" },
    { label: "Espaçamento", tool: "visual" },
    { label: "Imagens", tool: "media" },
    { label: "Botões", tool: "visual" },
    { label: "Fundo", tool: "visual" },
  ],
  benefits: [
    { label: "Tipografia", tool: "visual" },
    { label: "Espaçamento", tool: "visual" },
    { label: "Layout", tool: "layout" },
    { label: "Visibilidade", tool: "layout" },
  ],
  testimonials: [
    { label: "Layout", tool: "layout" },
    { label: "Visibilidade", tool: "layout" },
    { label: "Metadados", tool: "builder" },
  ],
  faq: [
    { label: "Tipografia", tool: "visual" },
    { label: "Espaçamento", tool: "visual" },
    { label: "Visibilidade", tool: "layout" },
  ],
  cta: [
    { label: "Botões", tool: "visual" },
    { label: "Tipografia", tool: "visual" },
    { label: "Layout", tool: "layout" },
  ],
  footer: [
    { label: "Tipografia", tool: "visual" },
    { label: "Visibilidade", tool: "layout" },
    { label: "Metadados", tool: "builder" },
  ],
};

const MODULE_NOTE: Record<string, string> = {
  builder: "O conteúdo e a prévia ao vivo estão no builder ao centro. A prévia acompanha o rascunho quando o módulo já faz isso.",
  visual: "Tipografia, espaçamento, botões, fundo e layout visual estão no editor visual ao centro.",
  layout: "Ordem e visibilidade estão no layout ao centro.",
  media: "Grade, busca, filtros, envio, substituição e prévia estão no gerenciador de mídia ao centro.",
  versoes: "Linha do tempo, autor, data, restauração e diferença estão no histórico ao centro.",
  preview: "A prévia usa a renderização atual da página. Computador, tablet e celular mudam a largura na hora.",
};

export function StudioFrame({
  children,
  current,
  tabs,
  toolHrefs,
  name,
  product,
  brand,
  publication,
  lastSaved,
  completion,
  policy,
  seo,
  googleAds,
  publishHref,
}: {
  children: ReactNode;
  current: string;
  tabs: WorkspaceTabItem[];
  toolHrefs: Record<string, string>;
  name: string;
  product: string;
  brand: string;
  publication: string;
  lastSaved: string;
  completion: number;
  policy: string;
  seo: string;
  googleAds: string;
  publishHref: string;
}) {
  const [block, setBlock] = useState<BlockId>("structure");
  const [notice, setNotice] = useState("");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const selected = BLOCKS.find((item) => item.id === block) ?? BLOCKS[0];

  function scrollTo(next: BlockId) {
    setBlock(next);
    const canvas = document.getElementById("studio-canvas");
    const target = BLOCKS.find((item) => item.id === next);
    const node = target && canvas ? target.targets.map((selector) => canvas.querySelector(selector)).find(Boolean) : null;
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
      setNotice("");
      return;
    }
    setNotice("Este bloco não está na página atual.");
  }

  function onSectionKey(event: KeyboardEvent<HTMLElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? buttons[(index + 1) % buttons.length]
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === "Home"
            ? buttons[0]
            : event.key === "End"
              ? buttons[buttons.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  function focusSave() {
    const canvas = document.getElementById("studio-canvas");
    const button = [...(canvas?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === "Save" && !item.disabled);
    if (button) {
      button.focus();
      button.scrollIntoView({ behavior: "smooth", block: "center" });
      setNotice("");
      return;
    }
    canvas?.focus();
    setNotice("Este módulo grava pelas ações já existentes na área central.");
  }

  return (
    <section aria-label="Estúdio da landing page" className="flex flex-col gap-ds-16">
      <header className="flex flex-col gap-ds-12">
        <div className="flex flex-col gap-ds-12 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-h3">{name}</p>
            <dl className="mt-ds-12 grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-3">
              <div><dt className="text-caption text-muted-foreground">Produto</dt><dd className="text-body">{product}</dd></div>
              <div><dt className="text-caption text-muted-foreground">Marca</dt><dd className="text-body">{brand}</dd></div>
              <div><dt className="text-caption text-muted-foreground">Publicação</dt><dd className="text-body">{publication}</dd></div>
              <div><dt className="text-caption text-muted-foreground">Último salvamento</dt><dd className="text-body">{lastSaved}</dd></div>
              <div><dt className="text-caption text-muted-foreground">Conclusão</dt><dd className="text-body">{completion}%</dd></div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-ds-8" aria-label="Ações rápidas">
            <Button asChild variant="secondary"><Link href={toolHrefs.preview ?? "#"}>Prévia</Link></Button>
            <Button type="button" variant="secondary" onClick={focusSave}>Salvar</Button>
            <Button asChild><Link href={publishHref}>Publicar</Link></Button>
          </div>
        </div>
      </header>

      <WorkspaceTabs label="Estúdio da landing page" current={current} items={tabs} labelledBy="studio-tab" />

      <div className="grid gap-ds-16 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_280px]">
        <nav
          aria-label="Blocos da landing page"
          onKeyDown={onSectionKey}
          className="flex gap-ds-8 overflow-x-auto lg:flex-col lg:overflow-visible"
        >
          {BLOCKS.map((item) => {
            const active = item.id === block;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                tabIndex={active ? 0 : -1}
                onClick={() => scrollTo(item.id)}
                className={cn(
                  "shrink-0 rounded-ds-sm px-ds-12 py-ds-8 text-left text-body text-muted-foreground",
                  active && "bg-secondary font-semibold text-foreground",
                  focusRing,
                )}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {current === "preview" ? (
            <div role="group" aria-label="Tamanho da prévia" className="mb-ds-12 flex gap-ds-8 overflow-x-auto">
              {(["desktop", "tablet", "mobile"] as const).map((item) => (
                <Button key={item} type="button" variant={viewport === item ? "primary" : "secondary"} aria-pressed={viewport === item} onClick={() => setViewport(item)}>
                  {item === "desktop" ? "Computador" : item === "tablet" ? "Tablet" : "Celular"}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <div
              id="studio-canvas"
              tabIndex={-1}
              style={current === "preview" ? { width: PREVIEW_WIDTH[viewport] } : undefined}
              className="mx-auto outline-none focus-visible:shadow-ds-focus"
            >
              {children}
            </div>
          </div>
          <p className="mt-ds-8 text-caption text-muted-foreground" role="status">{notice}</p>
        </div>

        <aside aria-label="Propriedades e publicação" className="flex flex-col gap-ds-12">
          <Card>
            <CardContent>
              <h2 className="text-h3">Propriedades</h2>
              <p className="mt-ds-4 text-caption text-muted-foreground">{selected.label}</p>
              <ul className="mt-ds-12 flex flex-col gap-ds-8 text-body">
                {PROPERTIES[selected.id].map((item) => (
                  <li key={item.label}>
                    {toolHrefs[item.tool] && item.tool !== current ? (
                      <Link href={toolHrefs[item.tool]} className="text-primary-text underline-offset-4 hover:underline">{item.label}</Link>
                    ) : (
                      <span>{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-ds-12 text-caption text-muted-foreground">{MODULE_NOTE[current] ?? MODULE_NOTE.builder}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h2 className="text-h3">Publicação</h2>
              <dl className="mt-ds-12 flex flex-col gap-ds-12">
                <div><dt className="text-caption text-muted-foreground">Política</dt><dd className="text-body">{policy}</dd></div>
                <div><dt className="text-caption text-muted-foreground">SEO</dt><dd className="text-body">{seo}</dd></div>
                <div><dt className="text-caption text-muted-foreground">Google Ads</dt><dd className="text-body">{googleAds}</dd></div>
                <div><dt className="text-caption text-muted-foreground">Publicação</dt><dd className="text-body">{publication}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
