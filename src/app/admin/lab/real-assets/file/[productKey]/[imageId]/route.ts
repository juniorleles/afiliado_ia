import { readFileSync, existsSync } from "node:fs";
import { requireAdmin } from "@/lib/admin-auth";
import { readCatalog } from "@/lib/real-product-assets/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ productKey: string; imageId: string }> }) {
  await requireAdmin();
  const { productKey, imageId } = await context.params;
  const catalog = readCatalog(productKey);
  const image = catalog?.images.find((item) => item.id === imageId);
  if (!image || image.status !== "USER_APPROVED" || !image.localFile || !existsSync(image.localFile)) {
    return new Response("Not found", { status: 404 });
  }
  const body = readFileSync(image.localFile);
  const type = image.format === "png" ? "image/png" : image.format === "webp" ? "image/webp" : "image/jpeg";
  return new Response(body, { headers: { "content-type": type, "cache-control": "private, max-age=60" } });
}
