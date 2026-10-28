import { requireAdmin } from "@/lib/admin-auth";
import { loadPremiumPresellDesignStandard, readPremiumReferenceBytes } from "@/lib/presell-quality/premium-standard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const standard = loadPremiumPresellDesignStandard();
  const body = readPremiumReferenceBytes();
  if (!standard.registered || !body) {
    return new Response("Official premium reference PNG is not registered.", { status: 404 });
  }
  return new Response(body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
      "x-premium-standard": standard.id,
      "x-premium-reference-hash": standard.hash ?? "",
    },
  });
}
