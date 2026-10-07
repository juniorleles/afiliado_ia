import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClass } from "./styles";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || props["aria-invalid"] ? true : undefined}
    className={cn(fieldClass, "min-h-24 py-ds-8", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
