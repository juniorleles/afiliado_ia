import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-ds-md border border-border px-ds-16 py-ds-12 text-body", {
  variants: {
    tone: {
      info: "bg-info-subtle text-info",
      success: "bg-success-subtle text-success",
      warning: "bg-warning-subtle text-warning",
      danger: "bg-danger-subtle text-danger",
    },
  },
  defaultVariants: { tone: "info" },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title: string;
}

function Alert({ className, tone, title, children, ...props }: AlertProps) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn(alertVariants({ tone }), className)} {...props}>
      <p className="text-label">{title}</p>
      {children ? <p className="mt-ds-4">{children}</p> : null}
    </div>
  );
}

export { Alert };
