"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { LoadingSpinner } from "./loading-spinner";
import { Pagination } from "./pagination";
import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export type DataTableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
};

export type DataTableSort = { id: string; direction: "asc" | "desc" };

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  loading = false,
  empty,
  pageSize = 20,
  page: pageProp,
  onPageChange,
  sort: sortProp,
  onSortChange,
  selectable = false,
  selectedIds: selectedProp,
  onSelectedIdsChange,
  onRowActivate,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  caption: string;
  loading?: boolean;
  empty?: React.ReactNode;
  pageSize?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  onRowActivate?: (row: T) => void;
}) {
  const [internalPage, setInternalPage] = React.useState(1);
  const [internalSort, setInternalSort] = React.useState<DataTableSort | null>(null);
  const [internalSelected, setInternalSelected] = React.useState<string[]>([]);
  const page = pageProp ?? internalPage;
  const sort = sortProp === undefined ? internalSort : sortProp;
  const selectedIds = selectedProp ?? internalSelected;
  const headerRef = React.useRef<HTMLInputElement>(null);

  const sorted = React.useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return rows;
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = column.sortValue!(left);
      const b = column.sortValue!(right);
      if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
      return String(a).localeCompare(String(b), "pt") * direction;
    });
  }, [columns, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleIds = visible.map(getRowId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  React.useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  function setPage(next: number) {
    if (onPageChange) onPageChange(next);
    else setInternalPage(next);
  }

  function setSort(next: DataTableSort) {
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
    setPage(1);
  }

  function setSelected(next: string[]) {
    if (onSelectedIdsChange) onSelectedIdsChange(next);
    else setInternalSelected(next);
  }

  function toggleSort(id: string) {
    const direction = sort?.id === id && sort.direction === "asc" ? "desc" : "asc";
    setSort({ id, direction });
  }

  function toggleAll() {
    if (allVisibleSelected) setSelected(selectedIds.filter((id) => !visibleIds.includes(id)));
    else setSelected([...new Set([...selectedIds, ...visibleIds])]);
  }

  function toggleOne(id: string) {
    setSelected(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  }

  return (
    <div className="flex flex-col gap-ds-12">
      <Table className="min-w-[36rem]" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            {selectable ? (
              <TableHead className="w-ds-40">
                <input
                  ref={headerRef}
                  type="checkbox"
                  className="h-ds-16 w-ds-16 accent-primary"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Selecionar todas as linhas desta página"
                  disabled={loading || visibleIds.length === 0}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => {
              const active = sort?.id === column.id ? sort.direction : undefined;
              return (
                <TableHead key={column.id} aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}>
                  {column.sortValue ? (
                    <button type="button" className="inline-flex items-center gap-ds-4 text-caption text-muted-foreground underline-offset-4 hover:underline" onClick={() => toggleSort(column.id)}>
                      {column.header}
                      {active === "asc" ? <ChevronUp aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} /> : null}
                      {active === "desc" ? <ChevronDown aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} /> : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 3 }, (_, index) => (
                <TableRow key={`loading-${index}`}>
                  <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
                    <Skeleton className="h-ds-16 w-full" />
                  </TableCell>
                </TableRow>
              ))
            : null}
          {!loading && visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
                {empty ?? <EmptyState title="Nada para mostrar" description="Esta lista está vazia." />}
              </TableCell>
            </TableRow>
          ) : null}
          {!loading
            ? visible.map((row) => {
                const id = getRowId(row);
                const selected = selectedIds.includes(id);
                return (
                  <TableRow
                    key={id}
                    data-state={selected ? "selected" : undefined}
                    aria-selected={selectable ? selected : undefined}
                    tabIndex={onRowActivate ? 0 : undefined}
                    className={cn(selected && "border-l-2 border-l-primary", onRowActivate && "cursor-pointer")}
                    onClick={() => onRowActivate?.(row)}
                    onKeyDown={(event) => {
                      if (!onRowActivate) return;
                      if (event.key === "Enter") onRowActivate(row);
                    }}
                  >
                    {selectable ? (
                      <TableCell
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-ds-16 w-ds-16 accent-primary"
                          checked={selected}
                          onChange={() => toggleOne(id)}
                          aria-label={`Selecionar ${id}`}
                        />
                      </TableCell>
                    ) : null}
                    {columns.map((column) => (
                      <TableCell key={column.id}>{column.cell(row)}</TableCell>
                    ))}
                  </TableRow>
                );
              })
            : null}
        </TableBody>
      </Table>
      {loading ? <LoadingSpinner /> : null}
      {sorted.length > pageSize ? <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} /> : null}
    </div>
  );
}
