import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { listCatalogs } from "@/lib/real-product-assets/store";
import { discoverRealAssetsAction } from "@/app/admin/lab/real-assets/actions";
import { DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Real product assets lab",
  robots: { index: false, follow: false },
};

export default async function RealAssetsIndex() {
  await requireAdmin();
  const catalogs = listCatalogs();
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="real-assets">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab · Real product assets · not published</span>
        <Link href="/admin/lab/lp-generator">LP generator</Link>
        <Link href="/admin/lab/renderer-v4">Renderer V4</Link>
      </div>
      <div className="ds-index">
        <h1>Discover and authorize product images</h1>
        <p className="ds-muted">
          URLs are discovery sources only. Found images stay pending until you approve them. A valid approval is reused
          for the same file and lab scope. No purchase link is created from hop parameters.
        </p>
        <form action={discoverRealAssetsAction} style={{ display: "grid", gap: "1rem", maxWidth: "40rem", marginTop: "1.5rem" }}>
          <label>
            Product name
            <input name="productName" required defaultValue="FemiCore" style={{ display: "block", width: "100%", marginTop: 4 }} />
          </label>
          <label>
            Source URLs (one per line)
            <textarea
              name="urls"
              required
              rows={5}
              defaultValue={"https://getfemicore.com/help/affiliates.php\nhttps://getfemicore.com/text.php?hop=zzzzz&hopId=4ee34404-eb94-4fcc-9911-a6acd2e2a8d2"}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </label>
          <button className="ds-btn" type="submit">
            Discover images
          </button>
        </form>
        <h2 className="ds-h2" style={{ marginTop: "2rem" }}>
          Catalogs
        </h2>
        {catalogs.length === 0 ? <p className="ds-muted">No catalogs yet.</p> : null}
        <ul>
          {catalogs.map((catalog) => (
            <li key={catalog.productKey}>
              <Link href={`/admin/lab/real-assets/${catalog.productKey}`}>{catalog.productName}</Link>
              {" · "}
              {catalog.images.filter((item) => item.status === "USER_APPROVED").length} approved / {catalog.images.length} found
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
