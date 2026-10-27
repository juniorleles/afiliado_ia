import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { readGeneration, readGenerationModel } from "@/lib/lp-generator/store";
import { applyApprovedAssetsAction, rerunLpGenerationAction } from "@/app/admin/lab/lp-generator/actions";
import { DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Geração de LP",
  robots: { index: false, follow: false },
};

export default async function LpGenerationDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const record = readGeneration(id);
  if (!record) notFound();
  const model = readGenerationModel(id);
  const sections = model?.blueprint.sections.filter((item) => item.renderEligibility === "ELIGIBLE") ?? [];
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="lp-generator">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · {record.input.productName} · {record.status} · sem publicação</span>
        <Link href="/admin/lab/lp-generator">Todas as gerações</Link>
        {record.previewPath ? <Link href={record.previewPath}>Abrir preview</Link> : null}
      </div>
      <div className="ds-index">
        <h1>{record.input.productName}</h1>
        <p className="ds-muted">
          {record.id} · {record.timings.durationMs != null ? `${Math.round(record.timings.durationMs / 1000)}s` : "em andamento"} · copy{" "}
          {record.copy?.producer ?? "—"} · IA real: não
        </p>
        {record.errors.length ? (
          <section>
            <h2 className="ds-h2">Erros</h2>
            <ul>
              {record.errors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
        {record.limitations.length ? (
          <section>
            <h2 className="ds-h2">Limitações</h2>
            <ul>
              {record.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h2 className="ds-h2">Fontes</h2>
          <ul>
            {record.sources.map((source) => (
              <li key={source.url}>
                {source.ok ? "OK" : "FALHA"} · {source.url}
                {source.reason ? ` · ${source.reason}` : ""}
                {source.hopPlaceholder ? " · hop placeholder removido" : ""}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="ds-h2">Estratégia</h2>
          <p>
            {record.strategy
              ? `${record.strategy.status} · ${record.strategy.conversionGoal} · ${record.strategy.composition} · ${record.strategy.narrativeShape}`
              : "Ainda não gerada."}
          </p>
        </section>
        <section>
          <h2 className="ds-h2">Imagens aprovadas</h2>
          <p>
            Usadas: {record.assets.approvedUsed.length} · disponíveis: {record.assets.approvedAvailable} · pendentes:{" "}
            {record.assets.pendingCount}
          </p>
          {record.assets.approvedUsed.length ? (
            <ul>
              {record.assets.approvedUsed.map((image) => (
                <li key={image.id}>
                  {image.role} · {image.id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ds-muted">Nenhuma imagem USER_APPROVED foi selecionada.</p>
          )}
          <p>
            <Link href={`/admin/lab/real-assets/${record.productKey}`}>Abrir catálogo de imagens</Link>
          </p>
          <form action={applyApprovedAssetsAction} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="generationId" value={record.id} />
            <button className="ds-btn" type="submit">
              Aplicar imagens aprovadas ao preview
            </button>
          </form>
        </section>
        <section>
          <h2 className="ds-h2">Quality gates</h2>
          {record.gateLabels ? (
            <ul>
              <li>TECHNICAL_PASS: {String(record.gateLabels.TECHNICAL_PASS)}</li>
              <li>CONTENT_PASS: {String(record.gateLabels.CONTENT_PASS)}</li>
              <li>ASSET_AUTHORIZATION_PASS: {String(record.gateLabels.ASSET_AUTHORIZATION_PASS)}</li>
              <li>COMMERCIAL_POLICY_PASS: {String(record.gateLabels.COMMERCIAL_POLICY_PASS)}</li>
              <li>VISUAL_REVIEW_PENDING: {String(record.gateLabels.VISUAL_REVIEW_PENDING)}</li>
              <li>HUMAN_APPROVAL_PENDING: {String(record.gateLabels.HUMAN_APPROVAL_PENDING)}</li>
            </ul>
          ) : (
            <p className="ds-muted">Gates ainda não avaliados.</p>
          )}
          {record.defects.length ? (
            <ul>
              {record.defects.map((item) => (
                <li key={item.id}>
                  {item.severity} · {item.kind} · {item.message}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <section>
          <h2 className="ds-h2">Evidências no contrato</h2>
          {model ? (
            <ul>
              {model.contract.evidence.slice(0, 40).map((entry) => (
                <li key={entry.id}>
                  {entry.field} · {entry.sourceUrl ?? "sem URL"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ds-muted">Modelo ainda não persistido.</p>
          )}
          <p className="ds-muted">{sections.length} seções elegíveis no blueprint.</p>
        </section>
        <form action={rerunLpGenerationAction} style={{ marginTop: "2rem" }}>
          <input type="hidden" name="productName" value={record.input.productName} />
          <input type="hidden" name="category" value={record.input.category ?? ""} />
          <input type="hidden" name="salesUrl" value={record.input.salesUrl} />
          <input type="hidden" name="affiliateUrl" value={record.input.affiliateUrl ?? ""} />
          <input type="hidden" name="hopLink" value={record.input.hopLink ?? ""} />
          <input type="hidden" name="language" value={record.input.language} />
          <input type="hidden" name="market" value={record.input.market} />
          <input type="hidden" name="goal" value={record.input.goal} />
          <button className="ds-btn" type="submit">
            Reexecutar geração
          </button>
        </form>
      </div>
    </div>
  );
}
