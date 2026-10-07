import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-ds-8 rounded-ds-full px-ds-8 py-ds-4 text-label", {
  variants: {
    tone: {
      success: "bg-success-subtle text-success",
      warning: "bg-warning-subtle text-warning",
      review: "bg-review-subtle text-review",
      danger: "bg-danger-subtle text-danger",
      info: "bg-info-subtle text-info",
      neutral: "bg-secondary text-muted-foreground",
    },
  },
  defaultVariants: { tone: "info" },
});

export const badgeStatuses = {
  excelente: { tone: "success", label: "Excelente" },
  pronto: { tone: "success", label: "Pronto" },
  atencao: { tone: "warning", label: "Atenção" },
  revisar: { tone: "review", label: "Revisar" },
  bloqueado: { tone: "danger", label: "Bloqueado" },
  "em-analise": { tone: "info", label: "Em análise" },
  desconhecido: { tone: "neutral", label: "Desconhecido" },
} as const;

export type BadgeStatus = keyof typeof badgeStatuses;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  status?: BadgeStatus;
}

function Badge({ className, tone, status, children, ...props }: BadgeProps) {
  const mapped = status ? badgeStatuses[status] : null;
  return (
    <span className={cn(badgeVariants({ tone: mapped?.tone ?? tone }), className)} {...props}>
      <span aria-hidden className="h-ds-8 w-ds-8 rounded-ds-full bg-current" />
      {children ?? mapped?.label}
    </span>
  );
}

export { Badge, badgeVariants };
