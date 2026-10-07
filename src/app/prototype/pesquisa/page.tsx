import Link from "next/link";
import { PageIntro, TechnicalDetails } from "@/components/prototype/blocks";
import { SearchForm } from "@/components/prototype/search-form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prototypeSearch } from "@/lib/prototype/mock";

export default function SearchPage() {
  return (
    <>
      <PageIntro title="Nova pesquisa" lede="Informe a Keyword e o mercado. A busca deste protótipo não sai da tela." />
      <SearchForm />
      <h2 className="mb-3 mt-8 text-[22px] font-semibold leading-8">Pesquisas recentes</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Keyword</TableHead>
            <TableHead>País</TableHead>
            <TableHead>Quando</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-semibold">{prototypeSearch.keyword}</TableCell>
            <TableCell>{prototypeSearch.country}</TableCell>
            <TableCell>Hoje</TableCell>
            <TableCell>
              <Link className="text-[#175CD3] underline-offset-2 hover:underline" href="/prototype/pesquisa/resultado">
                Abrir
              </Link>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TechnicalDetails />
    </>
  );
}
