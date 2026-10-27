import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { toGalleryCard } from "@/lib/real-product-assets/gallery";
import { readCatalog } from "@/lib/real-product-assets/store";
import { RealAssetGallery } from "@/components/real-product-assets/gallery";
import { DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";
import "@/app/real-assets-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "Authorize product images", robots: { index: false, follow: false } };

function flashFrom(query: Record<string, string | string[] | undefined>): { tone: "ok" | "error"; text: string } | null {
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  if (read("error") === "empty") return { tone: "error", text: "Nenhuma imagem selecionada." };
  if (read("error") === "approve" || read("failed")) {
    return { tone: "error", text: "Não foi possível aprovar esta imagem. Tente novamente." };
  }
  if (read("error")) return { tone: "error", text: "Não foi possível atualizar esta imagem. Tente novamente." };
  if (read("approved")) return { tone: "ok", text: `Autorização gravada para ${read("approved")} imagem(ns).` };
  if (read("rejected")) return { tone: "ok", text: "Imagem rejeitada." };
  if (read("revoked")) return { tone: "ok", text: "Autorização revogada." };
  return null;
}

export default async function RealAssetCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ productKey: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { productKey } = await params;
  const query = searchParams ? await searchParams : {};
  const catalog = readCatalog(productKey);
  if (!catalog) notFound();
  const cards = catalog.images.map(toGalleryCard);
  const pending = cards.filter((card) => card.status === "PENDING_USER_APPROVAL" || card.status === "DISCOVERED").length;
  const flash = flashFrom(query);
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="real-assets">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · Authorize images · {catalog.productName}</span>
        <Link href="/admin/lab/real-assets">All catalogs</Link>
        <Link href={`/admin/lab/renderer-v4/real/${catalog.productKey}`}>Open V4 preview</Link>
      </div>
      <div className="ds-index">
        <h1>{catalog.productName}</h1>
        <p className="ds-muted">
          Miniaturas servem só para revisão. Preview não autoriza uso na LP. Aprovação continua explícita.
        </p>
        <p className="ds-caption">
          {cards.length} descobertas · {pending} aguardando aprovação · 0 aprovação automática
        </p>
        <p className="ds-caption">Sources: {catalog.sourcePages.join(" · ") || "none fetched"}</p>
        {flash ? (
          <p className="ds-caption" role="alert" data-approval-flash={flash.tone} data-approval-error={flash.tone === "error" ? "1" : undefined} data-approval-ok={flash.tone === "ok" ? "1" : undefined}>
            {flash.text}
          </p>
        ) : null}
        <RealAssetGallery productKey={catalog.productKey} cards={cards} />
      </div>
    </div>
  );
}
