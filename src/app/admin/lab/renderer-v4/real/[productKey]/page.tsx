import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { commercialImageFromApproved, approvedGallerySrcs } from "@/lib/real-product-assets/overlay";
import { readCatalog } from "@/lib/real-product-assets/store";
import { DsContainer, DsKicker, DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";
import "@/app/renderer-v4-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "V4 real-asset preview", robots: { index: false, follow: false } };

export default async function RealV4PreviewPage({ params }: { params: Promise<{ productKey: string }> }) {
  await requireAdmin();
  const { productKey } = await params;
  const catalog = readCatalog(productKey);
  if (!catalog) notFound();
  const hero = commercialImageFromApproved(catalog);
  const gallery = approvedGallerySrcs(catalog);
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="renderer-v4" data-ds-composition="editorial-premium">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · V4 preview · {catalog.productName} · no hop · not published</span>
        <Link href={`/admin/lab/real-assets/${catalog.productKey}`}>Authorize images</Link>
      </div>
      <main data-v4="page" data-v4-photo={hero ? "commercial" : "none"}>
        <section className="ds-hero-band" id="hero" data-v4-section="hero">
          <DsContainer>
            <div className={hero ? "ds-hero ds-hero--split" : "ds-hero ds-hero--editorial"}>
              <div>
                <DsKicker>Lab preview</DsKicker>
                <p className="v4-identity">{catalog.productName}</p>
                <h1 className="ds-display">{catalog.productName}</h1>
                <p className="ds-lead">No authorized purchase link is available in this preview.</p>
                {!hero ? (
                  <p className="ds-body">No user-approved commercial photograph is on file. The page stays editorial.</p>
                ) : null}
              </div>
              {hero ? (
                <div className="ds-hero__media">
                  <div className="ds-hero__stage">
                    <div className="ds-hero__frame">
                      <img src={hero.src} alt={hero.alt} data-v4-image="commercial" />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DsContainer>
        </section>
        {gallery.length ? (
          <section className="ds-section ds-section--alt v4-band" data-v4-section="gallery">
            <DsContainer width="wide">
              <h2 className="ds-h2">More images</h2>
              <div className="v4-gallery">
                {gallery.map((image) => (
                  <img key={image.src} src={image.src} alt={image.alt} data-v4-image="commercial" />
                ))}
              </div>
            </DsContainer>
          </section>
        ) : null}
        <footer className="ds-footer" data-v4-section="legal">
          <DsContainer width="content">
            <p className="ds-caption">This lab preview has no authorized purchase link. Images appear only after explicit operator approval.</p>
          </DsContainer>
        </footer>
      </main>
    </div>
  );
}
