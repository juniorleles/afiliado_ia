import Link from "next/link";
import { PortalShell } from "@/components/portal/portal-shell";

export default function NotFound() {
  return (
    <PortalShell>
      <header className="pt-page-head">
        <div className="pt-wrap">
          <p className="pt-kicker">404</p>
          <h1 className="pt-display">Page not found</h1>
          <p className="pt-lede">That address is not a published page.</p>
          <div className="pt-actions">
            <Link href="/reviews" className="pt-button">
              Browse reviews
            </Link>
            <Link href="/" className="pt-textlink">
              Home →
            </Link>
          </div>
        </div>
      </header>
    </PortalShell>
  );
}
