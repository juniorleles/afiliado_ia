import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function WizardSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader className="p-ds-24 pb-0">
          <h2 id={id} className="text-h3 text-foreground">{title}</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-ds-16 p-ds-24">{children}</CardContent>
      </Card>
    </section>
  );
}
