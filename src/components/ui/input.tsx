import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./styles";

export interface InputProps extends React.ComponentProps<"input"> {
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
    className={cn(fieldClass, "flex h-10", className)}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
