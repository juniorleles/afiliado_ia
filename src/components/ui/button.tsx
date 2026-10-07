import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { disabledControl, focusRing } from "./styles";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-ds-8 whitespace-nowrap rounded-ds-sm px-ds-16 py-[10px] text-button",
    "transition-colors duration-ds-fast ease-ds-standard",
    focusRing,
    disabledControl,
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--color-primary-press)]",
        primary: "bg-primary text-primary-foreground hover:bg-[var(--color-primary-press)]",
        secondary:
          "border border-input bg-secondary text-secondary-foreground hover:bg-[var(--color-secondary-hover)]",
        outline: "border border-input bg-card text-foreground hover:bg-secondary",
        ghost: "bg-transparent text-foreground hover:bg-accent",
        danger: "bg-danger-solid text-primary-foreground hover:brightness-95",
        success: "bg-success-solid text-primary-foreground hover:brightness-95",
        warning: "bg-warning-solid text-primary-foreground hover:brightness-95",
        link: "h-auto bg-transparent px-0 py-0 text-primary-text underline-offset-4 hover:underline",
        icon: "bg-transparent text-foreground hover:bg-accent",
      },
      size: {
        default: "",
        sm: "px-ds-12 py-ds-8",
        icon: "h-10 w-10 p-0",
      },
    },
    compoundVariants: [
      { variant: "link", class: "disabled:bg-transparent" },
      { variant: "ghost", class: "disabled:bg-transparent" },
      { variant: "icon", class: "disabled:bg-transparent" },
    ],
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
