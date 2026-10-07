import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

export function PageTemplate({
  title,
  description,
  primaryAction,
  children,
  sidebar,
}: {
  title: string;
  description: string;
  primaryAction: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  return (
    <div className="ds-container py-ds-24">
      <PageHeader title={title} description={description} actions={primaryAction} />
      <div className={cn("mt-ds-24 grid gap-ds-24", sidebar && "xl:grid-cols-[minmax(0,1fr)_var(--layout-sidebar)]")}>
        <div className="min-w-0">{children}</div>
        {sidebar ? <aside aria-label="Complemento da página">{sidebar}</aside> : null}
      </div>
    </div>
  );
}
