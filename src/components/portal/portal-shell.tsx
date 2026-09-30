import Link from "next/link";
import "@/app/portal.css";
import {
  HEALTH_DISCLAIMER_TEXT,
  PORTAL_LEGAL_LINKS,
  PORTAL_NAV_LINKS,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";

export const PORTAL_DISCLOSURE_TEXT =
  "Some links on this site are affiliate links. If you buy through them, we may earn a commission.";

function PortalHeader({ current }: { current?: string }) {
  return (
    <header className="pt-header">
      <div className="pt-wrap pt-header-inner">
        <Link href="/" className="pt-brand">
          {getPublicSiteName()}
        </Link>
        <nav aria-label="Primary" className="pt-nav">
          <ul>
            {PORTAL_NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} aria-current={current === link.href ? "page" : undefined}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function PortalFooter() {
  const site = getPublicSiteName();
  return (
    <footer className="pt-footer">
      <div className="pt-wrap pt-footer-grid">
        <div>
          <p className="pt-footer-brand">{site}</p>
          <p className="pt-footer-about">
            An independent review site. We restate what product listings and related public sources say, and we
            say plainly what those sources do not show.
          </p>
        </div>
        <nav aria-label="Site">
          <p className="pt-footer-heading">Site</p>
          <ul>
            {PORTAL_NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Policies">
          <p className="pt-footer-heading">Policies</p>
          <ul>
            {PORTAL_LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="pt-wrap pt-footer-fine">
        <p>
          {PORTAL_DISCLOSURE_TEXT} <Link href="/affiliate-disclosure">How affiliate links work</Link>.
        </p>
        {isHealthDisclaimerEnabled() ? <p>{HEALTH_DISCLAIMER_TEXT}</p> : null}
        <p>
          {site} is not the manufacturer or seller of the products it reviews. Product names and trademarks belong to
          their owners.
        </p>
      </div>
    </footer>
  );
}

export function PortalShell({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <div className="portal">
      <a href="#main" className="pt-skip">
        Skip to content
      </a>
      <PortalHeader current={current} />
      <div className="pt-disclosure" role="note" aria-label="Affiliate disclosure">
        <div className="pt-wrap">
          <p>
            {PORTAL_DISCLOSURE_TEXT} <Link href="/affiliate-disclosure">Learn more</Link>.
          </p>
        </div>
      </div>
      <main id="main" className="pt-main">
        {children}
      </main>
      <PortalFooter />
    </div>
  );
}
