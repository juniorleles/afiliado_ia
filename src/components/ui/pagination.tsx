"use client";

import * as React from "react";
import { Button } from "./button";

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  const current = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-end gap-ds-12">
      <p className="text-caption text-muted-foreground">
        Página {current} de {Math.max(pageCount, 1)}
      </p>
      <Button type="button" variant="secondary" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
        Anterior
      </Button>
      <Button type="button" variant="secondary" disabled={current >= pageCount} onClick={() => onPageChange(current + 1)}>
        Próxima
      </Button>
    </nav>
  );
}
