import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { recordSandboxClick } from "@/lib/sandbox/track";
import { readSandboxSession } from "@/lib/sandbox/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "SANDBOX simulated destination",
  robots: { index: false, follow: false },
};

export default async function SandboxOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string; product?: string; lp?: string; mode?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const sessionId = query.sid?.trim() ?? "";
  const productId = query.product?.trim() ?? "";
  const session = sessionId ? readSandboxSession(sessionId) : null;
  const recorded = session && productId
    ? recordSandboxClick({
        sessionId,
        productId,
        landingPageId: query.lp ?? session.landingPageId,
        presellMode: query.mode === "PRESELL_EDITORIAL" || query.mode === "PRESELL_BOFU"
          ? query.mode
          : session.presellMode,
      })
    : { ok: false as const, reason: "SANDBOX_SESSION_MISSING" as const };

  return (
    <main data-sandbox="true" data-sandbox-destination="local" style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.25rem" }}>
      <p data-sandbox-badge="">SANDBOX</p>
      <h1>Simulated offer destination</h1>
      <p>This page is a local laboratory simulation. It is not a commercial seller, manufacturer site, or ClickBank hop.</p>
      <p data-sandbox-event={recorded.ok ? "sandbox_offer_click" : recorded.reason}>
        {recorded.ok
          ? "A sandbox test event was recorded. No production click or sale was created."
          : "No sandbox test event was recorded."}
      </p>
      {session?.landingPageId ? (
        <p>
          <Link href={`/admin/lab/lp-generator/${session.landingPageId}/preview`}>Return to lab preview</Link>
        </p>
      ) : null}
    </main>
  );
}
