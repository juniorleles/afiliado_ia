"use client";

import { Bell } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";

export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
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
      <IconButton label="Notificações" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <Bell aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
      </IconButton>
      {open ? (
        <div id={panelId} role="region" aria-label="Notificações" className="ds-pop-in absolute right-0 z-40 mt-ds-8 w-72 rounded-ds-md border border-border bg-card p-ds-16 text-body text-foreground shadow-ds-2">
          <p>Nenhuma notificação nova neste exemplo.</p>
        </div>
      ) : null}
    </div>
  );
}
