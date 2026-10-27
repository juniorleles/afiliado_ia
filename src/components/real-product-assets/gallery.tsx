"use client";

import { useMemo, useState } from "react";
import { approveSelectedRealAssetsAction, decideRealAssetAction } from "@/app/admin/lab/real-assets/actions";
import { groupGalleryCards, thumbnailPath, type GalleryCard } from "@/lib/real-product-assets/gallery";

type Props = { productKey: string; cards: GalleryCard[] };

export function RealAssetGallery({ productKey, cards }: Props) {
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({});
  const groups = useMemo(() => groupGalleryCards(cards), [cards]);

  return (
    <div className="rpa-gallery">
      <form id="rpa-batch" action={approveSelectedRealAssetsAction} data-gallery="real-assets">
        <input type="hidden" name="productKey" value={productKey} />
        <div className="rpa-toolbar" data-gallery-toolbar="1">
          <p className="ds-body">Marque as miniaturas e confirme. Preview não autoriza uso na LP.</p>
          <button className="ds-btn" type="submit" data-approve-selected="1">
            Aprovar imagens selecionadas
          </button>
        </div>

        {groups.map((group) => (
          <section key={group.section} className="rpa-section" data-gallery-section={group.section}>
            <h2>
              {group.title} ({group.cards.length})
            </h2>
            <div className={group.section === "packshot" ? "rpa-grid rpa-grid--packshot" : "rpa-grid"}>
              {group.cards.map((card) => {
                const measured = dims[card.id];
                const error = card.displayable ? failed[card.id] : "Catalog URL is not an image file.";
                return (
                  <article
                    key={card.id}
                    className="rpa-card"
                    data-image-id={card.id}
                    data-kind={card.probableKind}
                    data-gallery-section={card.section}
                    data-status={card.status}
                    data-loaded={error ? "error" : measured ? "yes" : "pending"}
                  >
                    <div className="rpa-thumb-wrap">
                      {card.selectable ? (
                        <label className="rpa-select">
                          <input type="checkbox" name="imageId" value={card.id} data-select-image={card.id} />
                          Selecionar
                        </label>
                      ) : null}
                      {error ? (
                        <p className="rpa-error" data-thumb-error={card.id}>
                          Imagem indisponível: {error}
                        </p>
                      ) : (
                        <img
                          src={thumbnailPath(productKey, card.id)}
                          alt=""
                          loading={card.section === "decorative" ? "lazy" : "eager"}
                          data-thumb={card.id}
                          onLoad={(event) => {
                            const img = event.currentTarget;
                            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                              setDims((current) => ({ ...current, [card.id]: { width: img.naturalWidth, height: img.naturalHeight } }));
                            } else {
                              setFailed((current) => ({ ...current, [card.id]: "Decoded with empty dimensions." }));
                            }
                          }}
                          onError={() => setFailed((current) => ({ ...current, [card.id]: "Remote image failed to load." }))}
                        />
                      )}
                    </div>
                    <div className="rpa-body">
                      <p className="ds-kicker">
                        {card.status} · {card.visualClass} · {card.probableKind} · {card.match}
                      </p>
                      <p className="ds-body">{card.fileName}</p>
                      <p className="ds-caption">Origem: {card.originHost}</p>
                      {card.fixture ? <p className="ds-caption">Fixture de laboratório. Não é um asset comercial real.</p> : null}
                      {card.promotional ? <p className="ds-caption">Conteúdo promocional. Não promover automaticamente a packshot.</p> : null}
                      <p className="ds-caption">
                        {measured
                          ? `${measured.width} × ${measured.height}`
                          : card.width && card.height
                            ? `${card.width} × ${card.height}`
                            : "Dimensões indisponíveis"}
                      </p>
                      {card.policyBlock ? <p className="ds-caption">Policy: {card.policyBlock}</p> : null}
                      <div className="rpa-actions">
                        {error ? null : (
                          <details className="rpa-preview">
                            <summary className="ds-btn ds-btn--ghost" data-preview-open={card.id}>
                              Ver maior
                            </summary>
                            <div className="rpa-lightbox" data-lightbox-open={card.id}>
                              <div className="rpa-lightbox-inner">
                                <p className="ds-kicker">{card.fileName}</p>
                                <img src={thumbnailPath(productKey, card.id)} alt="" />
                                <p className="ds-caption">{card.url}</p>
                              </div>
                            </div>
                          </details>
                        )}
                        {card.selectable ? (
                          <button className="ds-btn" type="submit" form={`rpa-approve-${card.id}`}>
                            Approve
                          </button>
                        ) : null}
                        {card.status !== "REJECTED" && card.status !== "BLOCKED_BY_POLICY" ? (
                          <button className="ds-btn ds-btn--ghost" type="submit" form={`rpa-reject-${card.id}`}>
                            Reject
                          </button>
                        ) : null}
                        {card.status === "USER_APPROVED" ? (
                          <button className="ds-btn ds-btn--ghost" type="submit" form={`rpa-revoke-${card.id}`}>
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </form>

      {cards.map((card) => (
        <div key={`actions-${card.id}`} hidden>
          {card.selectable ? (
            <form id={`rpa-approve-${card.id}`} action={decideRealAssetAction}>
              <input type="hidden" name="productKey" value={productKey} />
              <input type="hidden" name="approveOne" value={card.id} />
            </form>
          ) : null}
          {card.status !== "REJECTED" && card.status !== "BLOCKED_BY_POLICY" ? (
            <form id={`rpa-reject-${card.id}`} action={decideRealAssetAction}>
              <input type="hidden" name="productKey" value={productKey} />
              <input type="hidden" name="rejectOne" value={card.id} />
            </form>
          ) : null}
          {card.status === "USER_APPROVED" ? (
            <form id={`rpa-revoke-${card.id}`} action={decideRealAssetAction}>
              <input type="hidden" name="productKey" value={productKey} />
              <input type="hidden" name="revokeOne" value={card.id} />
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
