"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-transparent" />
        <DialogPrimitive.Content
          aria-modal="true"
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[min(400px,100%)] flex-col bg-card p-ds-24 text-foreground shadow-ds-2",
            focusRing,
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="pr-ds-32 text-h2 outline-none">
            {title}
          </DialogPrimitive.Title>
          <div className="mt-ds-16 flex-1 overflow-y-auto text-body">{children}</div>
          <DialogPrimitive.Close className={cn("absolute right-ds-16 top-ds-16 rounded-ds-sm p-ds-8", focusRing)} aria-label="Fechar">
            <X aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
