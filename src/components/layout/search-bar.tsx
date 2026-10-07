"use client";

import { Input } from "@/components/ui/input";

export function SearchBar() {
  return (
    <form role="search" className="relative min-w-0" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="global-search" className="sr-only">
        Pesquisar
      </label>
      <Input
        id="global-search"
        type="search"
        className="lg:pr-ds-64"
        placeholder="Pesquisar produtos, campanhas ou palavras-chave..."
        aria-keyshortcuts="Control+K"
      />
      <kbd aria-hidden className="pointer-events-none absolute right-ds-12 top-1/2 hidden -translate-y-1/2 text-caption text-muted-foreground lg:inline">
        Ctrl K
      </kbd>
    </form>
  );
}
