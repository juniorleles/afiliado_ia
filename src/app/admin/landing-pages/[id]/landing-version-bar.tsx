import { Button } from "@/components/ui/button";

export const LANDING_VERSION_LABEL = "V1";

export const LANDING_VERSION_ACTIONS = [
  { id: "create", label: "Nova versão" },
  { id: "duplicate", label: "Duplicar" },
  { id: "compare", label: "Comparar" },
] as const;

export function LandingVersionBar() {
  return (
    <section className="flex flex-col gap-ds-16 rounded-ds-md border border-border bg-card p-ds-16 sm:flex-row sm:items-center sm:justify-between" aria-label="Versões da landing">
      <div>
        <p className="text-caption text-muted-foreground">Versão</p>
        <p className="text-h3">{LANDING_VERSION_LABEL}</p>
      </div>
      <div className="flex flex-wrap gap-ds-8">
        {LANDING_VERSION_ACTIONS.map((action) => (
          <Button key={action.id} type="button" variant="secondary" disabled>
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
