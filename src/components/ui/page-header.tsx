import * as React from "react";
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb";

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
}) {
  return (
    <header className="flex flex-col gap-ds-12">
      {breadcrumb && breadcrumb.length > 0 ? <Breadcrumb items={breadcrumb} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-ds-16">
        <div className="min-w-0">
          <h1 className="text-h1">{title}</h1>
          {description ? <p className="mt-ds-8 max-w-content text-body text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? (
          <div data-primary-action className="flex flex-wrap gap-ds-8">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
