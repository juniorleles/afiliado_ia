"use client";

import { Input } from "@/components/ui/input";

export function SearchBar() {
  return (
    <form role="search" className="min-w-0" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="global-search" className="sr-only">
        Pesquisar
      </label>
      <Input id="global-search" type="search" placeholder="Pesquisar produtos, campanhas ou palavras-chave..." />
    </form>
  );
}
