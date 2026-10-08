"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { DeleteButton } from "@/app/admin/delete-button";
import { DuplicateButton } from "@/app/admin/duplicate-button";
import { UnpublishButton } from "@/app/admin/unpublish-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

export type AdminCampaignCard = {
  id: number;
  name: string;
  slug: string;
  product: string;
  brand: string;
  published: boolean;
  gate: "READY" | "REVIEW_REQUIRED" | "BLOCKED";
  completion: number;
  updatedAt: string;
};

const ALL = "all";
const MenuClose = createContext<() => void>(() => {});

const menuLinkClass = cn(
  "block rounded-ds-sm px-ds-12 py-ds-8 text-body text-foreground hover:bg-secondary",
  focusRing,
);

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function policyLabel(gate: AdminCampaignCard["gate"]) {
  if (gate === "READY") return "Pronta";
  if (gate === "BLOCKED") return "Bloqueada";
  return "Em revisão";
}

function policyTone(gate: AdminCampaignCard["gate"]) {
  if (gate === "READY") return "success" as const;
  if (gate === "BLOCKED") return "danger" as const;
  return "review" as const;
}

function matchesUpdate(iso: string, mode: string, now: Date) {
  if (mode === ALL) return true;
  const updated = new Date(iso);
  if (Number.isNaN(updated.getTime())) return false;
  if (mode === "hoje") return dayKey(updated) === dayKey(now);
  const days = mode === "7" ? 7 : 30;
  const elapsed = now.getTime() - updated.getTime();
  return elapsed >= 0 && elapsed <= days * 24 * 60 * 60 * 1000;
}

function matches(campaign: AdminCampaignCard, filters: Filters, now: Date) {
  const query = filters.query.trim().toLocaleLowerCase("pt");
  if (query) {
    const haystack = `${campaign.name} ${campaign.product} ${campaign.brand} ${campaign.slug}`.toLocaleLowerCase("pt");
    if (!haystack.includes(query)) return false;
  }
  if (filters.status === "publicada" && !campaign.published) return false;
  if (filters.status === "rascunho" && campaign.published) return false;
  if (filters.status === "revisao" && campaign.gate !== "REVIEW_REQUIRED") return false;
  if (filters.status === "bloqueada" && campaign.gate !== "BLOCKED") return false;
  if (filters.status === "pronta" && campaign.gate !== "READY") return false;
  if (filters.product !== ALL && campaign.product !== filters.product) return false;
  if (filters.policy !== ALL && filters.policy === "pronta" && campaign.gate !== "READY") return false;
  if (filters.policy !== ALL && filters.policy === "revisao" && campaign.gate !== "REVIEW_REQUIRED") return false;
  if (filters.policy !== ALL && filters.policy === "bloqueada" && campaign.gate !== "BLOCKED") return false;
  if (filters.publication === "publicada" && !campaign.published) return false;
  if (filters.publication === "rascunho" && campaign.published) return false;
  return matchesUpdate(campaign.updatedAt, filters.updated, now);
}

type Filters = {
  query: string;
  status: string;
  product: string;
  policy: string;
  publication: string;
  updated: string;
};

function policyRank(gate: AdminCampaignCard["gate"]) {
  if (gate === "BLOCKED") return 0;
  if (gate === "REVIEW_REQUIRED") return 1;
  return 2;
}

function compare(sort: string, left: AdminCampaignCard, right: AdminCampaignCard) {
  const newest = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  if (sort === "oldest") return -newest || left.id - right.id;
  if (sort === "completion") return right.completion - left.completion || newest || left.id - right.id;
  if (sort === "publication") return Number(right.published) - Number(left.published) || newest;
  if (sort === "policy") return policyRank(left.gate) - policyRank(right.gate) || newest;
  return newest || right.id - left.id;
}

function MoreMenu({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const menu = document.getElementById(menuId);
    menu?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId, open]);

  function onMenuKey(event: KeyboardEvent<HTMLUListElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  function close() {
    setOpen(false);
  }

  return (
    <MenuClose.Provider value={close}>
    <div ref={rootRef} className="relative">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Mais ações de ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        Mais…
      </Button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={`Ações de ${name}`}
          onKeyDown={onMenuKey}
          className="absolute right-0 z-20 mt-ds-4 w-64 rounded-ds-md border border-border bg-card p-ds-4 shadow-ds-2"
        >
          {children}
        </ul>
      ) : null}
    </div>
    </MenuClose.Provider>
  );
}

function MenuLink({ href, children }: { href: string; children: string }) {
  const close = useContext(MenuClose);
  return (
    <li role="none">
      <Link role="menuitem" href={href} className={menuLinkClass} onClick={close}>
        {children}
      </Link>
    </li>
  );
}

function CampaignCardView({ campaign, googleAds }: { campaign: AdminCampaignCard; googleAds: string }) {
  const score = Math.max(0, Math.min(100, Math.round(campaign.completion)));
  return (
    <Card>
      <CardContent className="flex flex-col gap-ds-16">
        <div className="flex flex-col gap-ds-12 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-h3">{campaign.name}</h3>
            <p className="mt-ds-4 text-caption text-muted-foreground">{campaign.slug}</p>
          </div>
          <div className="flex flex-wrap gap-ds-8">
            <Badge tone={campaign.published ? "success" : "warning"}>{campaign.published ? "Publicada" : "Rascunho"}</Badge>
            <Badge tone={policyTone(campaign.gate)}>{policyLabel(campaign.gate)}</Badge>
          </div>
        </div>
        <dl className="grid gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-caption text-muted-foreground">Produto</dt>
            <dd className="text-body">{campaign.product}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Marca</dt>
            <dd className="text-body">{campaign.brand}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Google Ads</dt>
            <dd className="text-body">{googleAds}</dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Atualização</dt>
            <dd className="text-body">{formatUpdated(campaign.updatedAt)}</dd>
          </div>
        </dl>
        <div>
          <div className="mb-ds-4 flex items-center justify-between gap-ds-12 text-caption text-muted-foreground">
            <span>Conclusão</span>
            <span>{score}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Conclusão de ${campaign.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            className="h-2 overflow-hidden rounded-ds-full bg-secondary"
          >
            <div className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-ds-normal" style={{ width: `${score}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-ds-8">
          <Button asChild>
            <Link href={`/admin/${campaign.id}/edit`} aria-label={`Abrir ${campaign.name}`}>Abrir</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/admin/${campaign.id}/publish`} aria-label={`Publicar ${campaign.name}`}>Publicar</Link>
          </Button>
          <DuplicateButton id={campaign.id} name={campaign.name} />
          <MoreMenu name={campaign.name}>
            <MenuLink href={campaign.published ? `/p/${campaign.slug}` : `/admin/preview/${campaign.slug}`}>
              {campaign.published ? "Ver página" : "Prévia"}
            </MenuLink>
            <MenuLink href={`/admin/visual-concepts/${campaign.slug}`}>Conceitos visuais</MenuLink>
            <MenuLink href={`/admin/${campaign.id}/analytics`}>Análises</MenuLink>
            <MenuLink href={`/admin/${campaign.id}/lint`}>Verificação</MenuLink>
            <MenuLink href={`/admin/product-health/${campaign.id}`}>Saúde do produto</MenuLink>
            <MenuLink href={`/admin/product-editor/${campaign.id}`}>Editor do produto</MenuLink>
            <MenuLink href={`/admin/product-editor/${campaign.id}#completeness`}>Completude</MenuLink>
            <MenuLink href={`/admin/lp-builder/${campaign.id}`}>Landing page</MenuLink>
            <MenuLink href={`/admin/lp-visual/${campaign.id}`}>Visual</MenuLink>
            <MenuLink href={`/admin/lp-media/${campaign.id}`}>Mídia</MenuLink>
            <MenuLink href={`/admin/lp-layout/${campaign.id}`}>Layout</MenuLink>
            <MenuLink href={`/admin/lp-versions/${campaign.id}`}>Histórico</MenuLink>
            {campaign.published ? (
              <li role="none">
                <UnpublishButton id={campaign.id} name={campaign.name} />
              </li>
            ) : null}
            <li role="none">
              <DeleteButton id={campaign.id} name={campaign.name} />
            </li>
          </MoreMenu>
        </div>
      </CardContent>
    </Card>
  );
}

export function CampaignBoard({
  campaigns,
  googleAds,
}: {
  campaigns: AdminCampaignCard[];
  googleAds: string;
}) {
  const [filters, setFilters] = useState<Filters>({
    query: "",
    status: ALL,
    product: ALL,
    policy: ALL,
    publication: ALL,
    updated: ALL,
  });
  const [sort, setSort] = useState("newest");

  const products = useMemo(
    () => [...new Set(campaigns.map((campaign) => campaign.product))].sort((left, right) => left.localeCompare(right, "pt")),
    [campaigns],
  );
  const visible = useMemo(() => {
    const now = new Date();
    return campaigns.filter((campaign) => matches(campaign, filters, now)).sort((left, right) => compare(sort, left, right));
  }, [campaigns, filters, sort]);

  const drafts = campaigns.filter((campaign) => !campaign.published).length;
  const published = campaigns.filter((campaign) => campaign.published).length;
  const reviews = campaigns.filter((campaign) => campaign.gate === "REVIEW_REQUIRED").length;
  const filtering = filters.query.trim() !== ""
    || filters.status !== ALL
    || filters.product !== ALL
    || filters.policy !== ALL
    || filters.publication !== ALL
    || filters.updated !== ALL;

  function resetFilters() {
    setFilters({ query: "", status: ALL, product: ALL, policy: ALL, publication: ALL, updated: ALL });
  }

  return (
    <div className="flex flex-col gap-ds-24">
      <div className="flex flex-col gap-ds-16 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 gap-ds-12 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard subject="Campanhas" value={String(campaigns.length)} period="Nesta instalação" />
          <MetricCard subject="Rascunhos" value={String(drafts)} period="Ainda não publicadas" />
          <MetricCard subject="Em revisão" value={String(reviews)} period="Política" />
          <MetricCard subject="Publicadas" value={String(published)} period="Páginas públicas" />
        </div>
        <div className="flex flex-wrap gap-ds-8">
          <Button asChild><Link href="/admin/new">Nova campanha</Link></Button>
          <Button asChild variant="secondary"><Link href="/admin/generate">Importar produto</Link></Button>
          <Button asChild variant="secondary"><Link href="/admin/validation">Laboratório de validação</Link></Button>
        </div>
      </div>

      <div className="grid gap-ds-12 md:grid-cols-2 xl:grid-cols-3" aria-label="Filtros de campanhas">
        <SearchInput
          label="Busca"
          placeholder="Nome, produto ou marca"
          value={filters.query}
          onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
        />
        <Select
          id="campaign-status"
          label="Status"
          value={filters.status}
          onValueChange={(status) => setFilters((current) => ({ ...current, status }))}
          options={[
            { value: ALL, label: "Todos" },
            { value: "publicada", label: "Publicada" },
            { value: "rascunho", label: "Rascunho" },
            { value: "revisao", label: "Em revisão" },
            { value: "bloqueada", label: "Bloqueada" },
            { value: "pronta", label: "Pronta" },
          ]}
        />
        <Select
          id="campaign-product"
          label="Produto"
          value={filters.product}
          onValueChange={(product) => setFilters((current) => ({ ...current, product }))}
          options={[{ value: ALL, label: "Todos" }, ...products.map((product) => ({ value: product, label: product }))]}
        />
        <Select
          id="campaign-policy"
          label="Política"
          value={filters.policy}
          onValueChange={(policy) => setFilters((current) => ({ ...current, policy }))}
          options={[
            { value: ALL, label: "Todas" },
            { value: "pronta", label: "Pronta" },
            { value: "revisao", label: "Em revisão" },
            { value: "bloqueada", label: "Bloqueada" },
          ]}
        />
        <Select
          id="campaign-publication"
          label="Publicação"
          value={filters.publication}
          onValueChange={(publication) => setFilters((current) => ({ ...current, publication }))}
          options={[
            { value: ALL, label: "Todas" },
            { value: "publicada", label: "Publicada" },
            { value: "rascunho", label: "Rascunho" },
          ]}
        />
        <Select
          id="campaign-updated"
          label="Atualização"
          value={filters.updated}
          onValueChange={(updated) => setFilters((current) => ({ ...current, updated }))}
          options={[
            { value: ALL, label: "Qualquer data" },
            { value: "hoje", label: "Hoje" },
            { value: "7", label: "Últimos 7 dias" },
            { value: "30", label: "Últimos 30 dias" },
          ]}
        />
      </div>

      <div className="flex flex-col gap-ds-12 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Select
            id="campaign-sort"
            label="Ordenar"
            value={sort}
            onValueChange={setSort}
            options={[
              { value: "newest", label: "Mais recentes" },
              { value: "oldest", label: "Mais antigas" },
              { value: "completion", label: "Conclusão" },
              { value: "publication", label: "Publicação" },
              { value: "policy", label: "Política" },
            ]}
          />
        </div>
        <p className="text-body text-muted-foreground" aria-live="polite">
          Mostrando {visible.length} de {campaigns.length}
        </p>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon="campanhas"
          title="Nenhuma campanha encontrada"
          description="Crie a primeira campanha para começar."
          action={<Button asChild><Link href="/admin/new">Nova campanha</Link></Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma campanha encontrada"
          description="Nenhuma campanha corresponde a estes filtros."
          action={<Button type="button" variant="secondary" onClick={resetFilters}>Limpar filtros</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-ds-16">
          {visible.map((campaign) => (
            <li key={campaign.id}>
              <CampaignCardView campaign={campaign} googleAds={googleAds} />
            </li>
          ))}
        </ul>
      )}
      {filtering && visible.length > 0 ? (
        <div>
          <Button type="button" variant="ghost" onClick={resetFilters}>Limpar filtros</Button>
        </div>
      ) : null}
    </div>
  );
}
