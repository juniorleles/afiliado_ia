import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listGenerations } from "@/lib/lp-generator/store";
import { startLpGenerationAction } from "@/app/admin/lab/lp-generator/actions";
import { DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Gerador universal de LP",
  robots: { index: false, follow: false },
};

export default async function LpGeneratorIndex({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const rows = listGenerations();
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="lp-generator">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · Gerador universal de LP · sem publicação</span>
        <Link href="/admin/lab/renderer-v4">Renderer V4</Link>
        <Link href="/admin/lab/real-assets">Imagens reais</Link>
      </div>
      <div className="ds-index">
        <h1>Gerar landing page</h1>
        <p className="ds-muted">
          Informe o produto e as fontes. O pipeline pesquisa, monta o contrato, a estratégia, a copy e o preview V4.
          Sem HopLink autorizado o preview não ativa CTA de compra. Nenhuma página é publicada.
        </p>
        {query.error ? <p className="ds-muted">Erro: {query.error}</p> : null}
        <form action={startLpGenerationAction} style={{ display: "grid", gap: "1rem", maxWidth: "42rem", marginTop: "1.5rem" }}>
          <label>
            Nome do produto
            <input name="productName" required defaultValue="FemiCore" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Categoria (opcional)
            <input name="category" placeholder="dietary supplement" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            URL da página de vendas
            <input
              name="salesUrl"
              required
              defaultValue="https://getfemicore.com/text.php?hop=zzzzz&hopId=4ee34404-eb94-4fcc-9911-a6acd2e2a8d2"
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            URL da página de afiliados (opcional)
            <input
              name="affiliateUrl"
              defaultValue="https://getfemicore.com/help/affiliates.php"
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <label>
            HopLink real (opcional)
            <input name="hopLink" placeholder="Deixe vazio para preview sem CTA de compra" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Idioma da landing page
            <input name="language" defaultValue="en" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Mercado-alvo
            <input name="market" defaultValue="US" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Objetivo comercial
            <select name="goal" defaultValue="INFORM" style={{ display: "block", width: "100%", marginTop: 4 }}>
              <option value="INFORM">Informar (sem hop)</option>
              <option value="SEND_TO_DETAILS">Enviar para detalhes</option>
              <option value="SEND_TO_OFFER">Enviar para oferta</option>
            </select>
          </label>
          <button className="ds-btn" type="submit">
            Iniciar geração
          </button>
        </form>
        <h2 className="ds-h2" style={{ marginTop: "2rem" }}>
          Gerações
        </h2>
        {rows.length === 0 ? <p className="ds-muted">Nenhuma geração ainda.</p> : null}
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/admin/lab/lp-generator/${row.id}`}>{row.productName}</Link>
              {" · "}
              {row.status}
              {row.previewPath ? (
                <>
                  {" · "}
                  <Link href={row.previewPath}>preview</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
