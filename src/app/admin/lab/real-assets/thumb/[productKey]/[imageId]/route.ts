import { requireAdminApi } from "@/lib/admin-auth";
import { loadCatalogThumbnail } from "@/lib/real-product-assets/thumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ productKey: string; imageId: string }> }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const { productKey, imageId } = await context.params;
  const result = await loadCatalogThumbnail(productKey, imageId);
  if (!result.ok) {
    return new Response(result.reason, {
      status: result.status,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-thumb-error": result.reason },
    });
  }
  return new Response(Uint8Array.from(result.body), {
    headers: {
      "content-type": result.contentType,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
      "x-thumb-source": result.source,
      "x-thumb-bytes": String(result.bytes),
    },
  });
}
