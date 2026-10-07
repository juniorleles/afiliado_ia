import * as React from "react";

export function SectionHeader({
  id,
  title,
  description,
  actions,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-ds-12">
      <div>
        <h2 id={id} className="text-h2">{title}</h2>
        {description ? <p className="mt-ds-4 text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-ds-8">{actions}</div> : null}
    </div>
  );
}
