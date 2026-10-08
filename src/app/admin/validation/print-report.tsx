"use client";

import { Button } from "@/components/ui/button";

export function PrintReport() {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      Exportar relatório
    </Button>
  );
}
