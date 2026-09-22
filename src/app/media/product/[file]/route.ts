import { NextResponse } from "next/server";
import {
  isSafeImageFilename,
  optimizeLocalProductImage,
  parseProductImageOptimizeQuery,
  readProductImage,
} from "@/lib/product-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;
  if (!isSafeImageFilename(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const query = parseProductImageOptimizeQuery(new URL(request.url).searchParams);
  const image =
    query.width || query.format !== "original"
      ? await optimizeLocalProductImage(file, query)
      : await readProductImage(file);
  if (!image) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "content-type": image.contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      vary: "Accept",
    },
  });
}
