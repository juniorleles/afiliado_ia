import * as React from "react";
import { UiIcon, type UiIconName } from "./icons";

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
    <div className="flex flex-col items-start gap-ds-8 rounded-ds-md border border-dashed border-border bg-card p-ds-24">
      {icon ? <UiIcon name={icon} size={20} className="text-muted-foreground" /> : null}
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
      description="A lista de Products ainda não tem um item para abrir."
      action={props.action}
    />
  );
}

export function NoCampaignsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="campanhas"
      title="Nenhuma campanha"
      description="Nenhuma campanha aparece nesta lista."
      action={props.action}
    />
  );
}

export function NoReportsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="relatorios"
      title="Nenhum relatório"
      description="Ainda não há um relatório para comparar."
      action={props.action}
    />
  );
}

export function NoOpportunitiesEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="opportunity"
      title="Nenhuma oportunidade"
      description="Nenhuma oportunidade está nesta lista."
      action={props.action}
    />
  );
}

export function NoSearchResultsEmpty(props: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon="search"
      title="Nenhum resultado"
      description="A busca não devolveu linhas para esta lista."
      action={props.action}
    />
  );
}
