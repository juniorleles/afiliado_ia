"use client";

import * as React from "react";
import { Button } from "./button";

type ToastTone = "default" | "danger";

type ToastRecord = { id: string; message: string; tone: ToastTone };

type ToastContextValue = {
  push: (toast: { message: string; tone?: ToastTone }) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

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
      <div className="pointer-events-none fixed bottom-ds-16 right-ds-16 z-50 flex w-[min(360px,calc(100%-32px))] flex-col gap-ds-8">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "danger" ? "alert" : "status"}
            className="pointer-events-auto rounded-ds-md border border-border bg-card p-ds-16 text-body text-foreground shadow-ds-2"
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
