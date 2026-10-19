import {
  approveOfficialAssetAction,
  discoverOfficialAssetsAction,
  rejectOfficialAssetAction,
} from "@/app/admin/official-assets-action";
import type { OfficialPromoAsset } from "@/lib/official-assets/store";

const STATUS_LABEL = {
  pending: "Aguardando revisão",
  approved: "Aprovada",
  rejected: "Rejeitada",
} as const;

function originLabel(asset: OfficialPromoAsset): string {
  try {
    const page = new URL(asset.sourcePage);
    const file = new URL(asset.originalUrl);
    return `${page.host}${page.pathname} · arquivo ${file.host}`;
  } catch {
    return asset.sourcePage;
  }
}

export function OfficialAssetsPanel({
  campaignId,
  assets,
}: {
  campaignId: number;
  assets: OfficialPromoAsset[];
}) {
  return (
    <section className="space-y-4 rounded-md border border-zinc-800 p-4">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">Imagens oficiais do fabricante</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Só entram arquivos listados nas seções Product Images e Campaign Images. A autorização da imagem não comprova alegação médica. Nada é associado à campanha sem aprovação.
        </p>
      </div>
      <form action={discoverOfficialAssetsAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="campaignId" value={campaignId} />
        <label className="flex-1 text-xs text-zinc-500">
          Página oficial
          <input name="pageUrl" type="url" required placeholder="https://" className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        </label>
        <button type="submit" className="self-end rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-100">Descobrir imagens</button>
      </form>
      {assets.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma imagem oficial registrada.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => (
          <li key={asset.id} className="rounded-md border border-zinc-800 p-3">
            <img src={asset.localFile || asset.originalUrl} alt="" className="mb-2 h-28 w-full rounded-md bg-zinc-900 object-contain" />
            <p className="text-sm text-zinc-100">{asset.section === "product" ? "Imagem de produto" : "Imagem de campanha"}</p>
            <p className="mt-1 break-all text-xs text-zinc-500">{asset.fileName}</p>
            <p className="mt-1 text-xs text-zinc-400">Origem: {originLabel(asset)}</p>
            <p className="mt-1 text-xs text-zinc-300">Status: {STATUS_LABEL[asset.status]}{asset.isHero ? " · packshot do hero" : ""}</p>
            <p className="mt-1 text-xs text-zinc-500">Produto: {asset.productMatch === "confirmed" ? "nome encontrado no arquivo" : "nome não encontrado no arquivo"}</p>
            {asset.blockReason ? <p className="mt-1 text-xs text-amber-200">{asset.blockReason}</p> : null}
            {asset.reviewNote ? <p className="mt-1 text-xs text-zinc-400">{asset.reviewNote}</p> : null}
            <p className="mt-1 text-xs text-zinc-600">Verificado em {asset.verifiedAt.slice(0, 10)}</p>
            {asset.status === "pending" ? (
              <div className="mt-3 space-y-2">
                <form action={approveOfficialAssetAction} className="space-y-2">
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <label className="flex items-start gap-2 text-xs text-zinc-300">
                    <input type="checkbox" name="embeddedTextCleared" value="yes" required />
                    Revisei o texto da imagem. Não há claim, depoimento ou promessa não autorizada.
                  </label>
                  {asset.productMatch === "unconfirmed" ? (
                    <label className="flex items-start gap-2 text-xs text-zinc-300">
                      <input type="checkbox" name="productMatchConfirmed" value="yes" required />
                      Confirmei que a imagem corresponde a este produto.
                    </label>
                  ) : null}
                  <button type="submit" className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950">Aprovar e usar no hero</button>
                </form>
                <form action={rejectOfficialAssetAction} className="flex flex-col gap-2">
                  <input type="hidden" name="campaignId" value={campaignId} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input name="reviewNote" required minLength={8} placeholder="Motivo da rejeição" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100" />
                  <button type="submit" className="self-start rounded-md border border-zinc-600 px-3 py-1.5 text-sm">Rejeitar</button>
                </form>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
