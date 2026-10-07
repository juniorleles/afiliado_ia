"use client";

import * as React from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "warning" | "danger";

type ToastRecord = { id: string; message: string; tone: ToastTone };

type ToastContextValue = {
  push: (toast: { message: string; tone?: ToastTone }) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastTone, string> = {
  default: "border-border bg-card text-foreground",
  success: "border-success bg-success-subtle text-success",
  warning: "border-warning bg-warning-subtle text-warning",
  danger: "border-danger bg-danger-subtle text-danger",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastRecord[]>([]);

  const push = React.useCallback((toast: { message: string; tone?: ToastTone }) => {
    const id = crypto.randomUUID();
    const tone = toast.tone ?? "default";
    setItems((current) => [...current, { id, message: toast.message, tone }]);
    if (tone !== "danger") {
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 6000);
    }
  }, []);

  function dismiss(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-ds-16 right-ds-16 z-50 flex w-[min(360px,calc(100%-32px))] flex-col gap-ds-8"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "danger" ? "alert" : "status"}
            className={cn("ds-pop-in pointer-events-auto rounded-ds-md border p-ds-16 text-body shadow-ds-2", toneClass[item.tone])}
          >
            <p>{item.message}</p>
            <Button type="button" variant="link" className="mt-ds-8" onClick={() => dismiss(item.id)}>
              Fechar
            </Button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
