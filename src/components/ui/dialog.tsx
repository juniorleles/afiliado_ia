"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="ds-fade-in fixed inset-0 z-40 bg-[var(--color-overlay)]" />
    <DialogPrimitive.Content
      aria-modal="true"
      ref={ref}
      className={cn(
        "ds-sheet-in fixed inset-y-0 left-0 z-50 w-[280px] bg-background p-ds-16 shadow-ds-2 focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={cn("absolute right-ds-12 top-ds-12 rounded-ds-sm p-ds-8", focusRing)}>
        <span className="sr-only">Fechar</span>
        <X aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export { Dialog, DialogTrigger, DialogContent, DialogClose, DialogTitle };
