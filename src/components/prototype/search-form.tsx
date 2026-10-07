"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prototypeSearch } from "@/lib/prototype/mock";

export function SearchForm() {
  const router = useRouter();

  return (
    <form
      className="max-w-3xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        router.push("/prototype/pesquisa/resultado");
      }}
    >
      <label className="block text-xs text-foreground" htmlFor="keyword">
        Keyword
      </label>
      <Input id="keyword" name="keyword" defaultValue={prototypeSearch.keyword} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs">
          País
          <select
            name="country"
            defaultValue={prototypeSearch.country}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="US">US</option>
          </select>
        </label>
        <label className="block text-xs">
          Idioma
          <select
            name="language"
            defaultValue={prototypeSearch.language}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="en">en</option>
          </select>
        </label>
        <label className="block text-xs">
          Dispositivo
          <select
            name="device"
            defaultValue={prototypeSearch.device}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="desktop">desktop</option>
          </select>
        </label>
      </div>
      <Button type="submit">Pesquisar</Button>
    </form>
  );
}
