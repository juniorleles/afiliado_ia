"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { focusRing } from "./styles";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  secondaryLabel = "Voltar",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children?: React.ReactNode;
  primaryLabel: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
}) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ds-fade-in fixed inset-0 z-40 bg-[var(--color-overlay)]" />
        <DialogPrimitive.Content
          aria-modal="true"
          className={cn(
            "ds-fade-in fixed left-1/2 top-1/2 z-50 w-[min(480px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2",
            "rounded-ds-lg bg-card p-ds-32 text-foreground shadow-ds-2",
            focusRing,
          )}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
            const target = event.target as HTMLElement;
            if (target.tagName === "TEXTAREA" || target.closest("button, a")) return;
            event.preventDefault();
            onPrimary?.();
            onOpenChange(false);
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            titleRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title ref={titleRef} tabIndex={-1} className="text-h2 outline-none">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-ds-8 text-body text-muted-foreground">
            {description}
          </DialogPrimitive.Description>
          {children ? <div className="mt-ds-16">{children}</div> : null}
          <div className="mt-ds-24 flex flex-wrap justify-end gap-ds-8">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="secondary">
                {secondaryLabel}
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                onPrimary?.();
                onOpenChange(false);
              }}
            >
              {primaryLabel}
            </Button>
          </div>
          <DialogPrimitive.Close className={cn("absolute right-ds-16 top-ds-16 rounded-ds-sm p-ds-8", focusRing)} aria-label="Fechar">
            <X aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
