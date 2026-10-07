import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export interface CheckboxProps extends Omit<React.ComponentProps<"input">, "type"> {
  label: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ label, className, id, ...props }, ref) => {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <label className="inline-flex items-center gap-ds-8 text-body text-foreground" htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn("h-ds-16 w-ds-16 rounded-ds-sm accent-primary", focusRing, className)}
        {...props}
      />
      {label}
    </label>
  );
});
Checkbox.displayName = "Checkbox";

export { Checkbox };
