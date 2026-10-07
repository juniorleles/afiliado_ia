import Link from "next/link";
import * as React from "react";
import { Button } from "./button";
import { UiIcon, type UiIconName } from "./icons";

function EmptyIllustration({ icon }: { icon: UiIconName }) {
  return (
    <div aria-hidden className="flex h-16 w-16 items-center justify-center rounded-ds-lg bg-secondary text-muted-foreground">
      <UiIcon name={icon} size={20} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: UiIconName;
}) {
  return (
    <div className="flex flex-col items-start gap-ds-12 rounded-ds-md border border-dashed border-border bg-card p-ds-24">
      {icon ? <EmptyIllustration icon={icon} /> : null}
      <h3 className="text-h3">{title}</h3>
      <p className="max-w-content text-body text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function NoProductsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="produtos"
      title="Nenhum Product"
      description="Ainda não há um Product nesta lista. Uma pesquisa de mercado é o próximo passo."
      action={
        props.action ?? (
          <Button asChild>
            <Link href="/pesquisa">Pesquisar</Link>
          </Button>
        )
      }
    />
  );
}

export function NoCampaignsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="campanhas"
      title="Nenhuma campanha"
      description="Nenhuma campanha aparece nesta lista. Abra Products para escolher um Product observado."
      action={
        props.action ?? (
          <Button asChild>
            <Link href="/produtos">Ver Products</Link>
          </Button>
        )
      }
    />
  );
}

export function NoReportsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="relatorios"
      title="Nenhum relatório"
      description="Ainda não há um relatório. Uma pesquisa de mercado gera a primeira leitura."
      action={
        props.action ?? (
          <Button asChild>
            <Link href="/campanhas">Ver campanhas</Link>
          </Button>
        )
      }
    />
  );
}

export function NoOpportunitiesEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="opportunity"
      title="Nenhuma oportunidade"
      description="Nenhuma oportunidade está nesta lista. Comece por uma pesquisa de mercado."
      action={
        props.action ?? (
          <Button asChild>
            <Link href="/pesquisa">Pesquisar</Link>
          </Button>
        )
      }
    />
  );
}

export function NoSearchResultsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="search"
      title="Nenhum resultado"
      description="A busca não devolveu linhas. Ajuste a palavra e tente de novo."
      action={
        props.action ?? (
          <Button asChild>
            <Link href="/pesquisa">Nova pesquisa</Link>
          </Button>
        )
      }
    />
  );
}
