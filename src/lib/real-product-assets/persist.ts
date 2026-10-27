import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateOfficialFile } from "@/lib/official-assets/review";
import { fetchPublicHttps, MAX_IMAGE_BYTES, type SafeFetchResult } from "@/lib/real-product-assets/fetch";
import { readLabFixtureBytes } from "@/lib/real-product-assets/lab-fixture";
import { catalogDir } from "@/lib/real-product-assets/store";
import type { DiscoveredImage } from "@/lib/real-product-assets/types";

export type FetchImage = (url: string) => Promise<SafeFetchResult>;

export type StoreFileResult =
  | { ok: true; image: DiscoveredImage }
  | { ok: false; image: DiscoveredImage; reason: string };

export async function storeApprovedFile(
  image: DiscoveredImage,
  root: string,
  fetchImage: FetchImage = (url) => fetchPublicHttps(url, { maxBytes: MAX_IMAGE_BYTES }),
): Promise<StoreFileResult> {
  try {
    const local = readLabFixtureBytes(image.url);
    const fetched = local
      ? { ok: true as const, url: image.url, status: 200, contentType: "application/octet-stream", body: local }
      : await fetchImage(image.url);
    if (!fetched.ok) {
      return { ok: false, image: { ...image, localFile: null }, reason: fetched.reason };
    }
    const checked = validateOfficialFile(fetched.body);
    if ("error" in checked) {
      return { ok: false, image: { ...image, localFile: null }, reason: checked.error };
    }
    const ext = checked.format === "jpeg" ? "jpg" : checked.format;
    const dir = path.join(catalogDir(image.productKey, root), "files");
    mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${image.id}.${ext}`);
    writeFileSync(dest, fetched.body);
    return {
      ok: true,
      image: {
        ...image,
        localFile: dest,
        sha256: createHash("sha256").update(fetched.body).digest("hex"),
        width: checked.width,
        height: checked.height,
        format: checked.format,
        byteLength: fetched.body.length,
      },
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "write failed";
    console.error("[real-assets] persist failed", { productKey: image.productKey, imageId: image.id, reason });
    return { ok: false, image: { ...image, localFile: null }, reason };
  }
}
