import Link from "next/link";
import { PageIntro, PrimaryLink, TechnicalDetails } from "@/components/prototype/blocks";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prototypeOthers, prototypeProduct, prototypeSearch } from "@/lib/prototype/mock";

export default function SearchResultPage() {
  return (
    <>
      <PageIntro
        title={`Resultado: ${prototypeSearch.keyword}`}
        lede={`Mercado ${prototypeSearch.country}. Idioma ${prototypeSearch.language}. Dispositivo ${prototypeSearch.device}.`}
        action={<PrimaryLink href="/prototype/produto">Ver Product</PrimaryLink>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <CardTitle>Patrocinados</CardTitle>
            <p className="mt-2 text-[28px] font-semibold tabular-nums">{prototypeSearch.sponsoredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Orgânicos</CardTitle>
            <p className="mt-2 text-[28px] font-semibold tabular-nums">{prototypeSearch.organicCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <CardTitle>Tempo</CardTitle>
            <p className="mt-2 text-[28px] font-semibold">{prototypeSearch.duration}</p>
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 text-[22px] font-semibold">Ads</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Posição</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-semibold">{prototypeProduct.name}</TableCell>
            <TableCell>1</TableCell>
            <TableCell>
              <Link className="text-[#175CD3] underline-offset-2 hover:underline" href="/prototype/produto">
                Ver Product
              </Link>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <h2 className="mb-3 mt-8 text-[22px] font-semibold">Resultados orgânicos</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Marca</TableHead>
            <TableHead>Preço</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prototypeOthers.map((item) => (
            <TableRow key={item.name}>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.brand}</TableCell>
              <TableCell>{item.price}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="mt-3 text-sm text-muted-foreground">Sem coleta automática nos resultados orgânicos.</p>
      <h2 className="mb-3 mt-8 text-[22px] font-semibold">Landing pages coletadas</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Situação</TableHead>
            <TableHead>Endereço final</TableHead>
            <TableHead>Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>A página abriu</TableCell>
            <TableCell>stonehengehealth.com/products/dynamic-joint</TableCell>
            <TableCell>
              <Link className="text-[#175CD3] underline-offset-2 hover:underline" href="/prototype/produto/landing-page">
                Ver
              </Link>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <TechnicalDetails />
    </>
  );
}
