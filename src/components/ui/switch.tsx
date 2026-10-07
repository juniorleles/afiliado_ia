"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn("inline-flex items-center gap-ds-8 text-body text-foreground", focusRing, className)}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-ds-24 w-ds-40 items-center rounded-ds-full border border-input p-ds-4",
          checked ? "bg-primary" : "bg-secondary",
        )}
      >
        <span
          className={cn(
            "h-ds-16 w-ds-16 rounded-ds-full bg-card transition-transform duration-ds-fast ease-ds-standard",
            checked ? "translate-x-ds-16" : "translate-x-0",
          )}
        />
      </span>
      {label}
    </button>
  ),
);
Switch.displayName = "Switch";

export { Switch };
