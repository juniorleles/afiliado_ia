"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn("inline-flex h-10 w-10 items-center justify-center rounded-ds-full bg-secondary text-label text-secondary-foreground", focusRing)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden>OP</span>
        <span className="sr-only">Conta do operador</span>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Conta" className="absolute right-0 z-40 mt-ds-8 w-56 rounded-ds-md border border-border bg-card p-ds-8 shadow-ds-2">
          <p className="px-ds-12 py-ds-8 text-caption text-muted-foreground">Operador</p>
          <Link
            href="/configuracoes"
            role="menuitem"
            className={cn("block rounded-ds-sm px-ds-12 py-ds-8 text-body text-foreground hover:bg-secondary", focusRing)}
            onClick={() => setOpen(false)}
          >
            Conta
          </Link>
        </div>
      ) : null}
    </div>
  );
}
