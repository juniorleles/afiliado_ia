import type { Metadata } from "next";
import { readOperationsDashboard } from "@/lib/integrations/google-ads-operations/reports";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Relatório executivo do Google Ads" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GoogleAdsPrintReportPage() {
  const view = readOperationsDashboard();
  const rows = [
    ["Conta", view.accountName],
    ["Campanhas", String(view.campaigns)],
    ["Ativas", String(view.active)],
    ["Pausadas", String(view.paused)],
    ["Conversões", view.conversions],
    ["CPA", view.cpa],
    ["ROAS", view.roas],
    ["Gasto", view.spend],
    ["Receita", view.revenue],
    ["Recomendações", view.optimizationScore],
    ["Pendentes", String(view.pending)],
    ["Executadas hoje", String(view.executedToday)],
  ];
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-ds-16 p-ds-16">
      <h1 className="text-h1">Relatório executivo</h1>
      <p className="text-body">Use a impressão do navegador para gravar o PDF. A página mostra somente os números já armazenados.</p>
      <PrintButton />
      <table className="w-full text-body">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><th className="py-ds-8 text-left">{label}</th><td>{value}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
