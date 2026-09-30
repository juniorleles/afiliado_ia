import type { Metadata } from "next";
import { PortalShell } from "@/components/portal/portal-shell";
import { getPublicSiteName, publicAbsoluteUrl } from "@/lib/public-site";

/** Date these policy texts were last revised in the codebase. */
export const POLICY_LAST_UPDATED = "September 25, 2026";

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const site = getPublicSiteName();
  return {
    title: `${title} · ${site}`,
    description,
    alternates: { canonical: publicAbsoluteUrl(path) },
    robots: { index: true, follow: true },
    openGraph: { title: `${title} · ${site}`, description, url: publicAbsoluteUrl(path), siteName: site, type: "website" },
  };
}

export function PublicLegalLayout({
  title,
  path,
  kicker = "Site information",
  showUpdated = true,
  children,
}: {
  title: string;
  path?: string;
  kicker?: string;
  showUpdated?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PortalShell current={path}>
      <header className="pt-page-head">
        <div className="pt-wrap">
          <p className="pt-kicker">{kicker}</p>
          <h1 className="pt-display">{title}</h1>
          {showUpdated ? <p className="pt-updated">Last updated {POLICY_LAST_UPDATED}</p> : null}
        </div>
      </header>
      <div className="pt-wrap">
        <article className="pt-prose">{children}</article>
      </div>
    </PortalShell>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
