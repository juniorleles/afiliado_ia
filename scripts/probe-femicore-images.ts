import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchPublicHttps, MAX_IMAGE_BYTES } from "../src/lib/real-product-assets/fetch.ts";
import { sniffImageMime, readImageDimensions } from "../src/lib/assets/quality.ts";

const URLS = [
  "https://getfemicore.com/statics/img/prod_1_bottle_aff.png",
  "https://getfemicore.com/statics/img/prod_1_bottle_tsl.png",
  "https://getfemicore.com/statics/img/fe_6_bottle_mob.png",
  "https://getfemicore.com/statics/img/affimg.png",
];

async function probe(url: string, headers?: Record<string, string>) {
  const result = await fetchPublicHttps(url, { maxBytes: MAX_IMAGE_BYTES });
  if (!result.ok) {
    return { url, ok: false, status: result.status, reason: result.reason, headers: headers ?? null };
  }
  const mime = sniffImageMime(result.body);
  const dims = readImageDimensions(result.body);
  return {
    url: result.url,
    ok: true,
    status: result.status,
    contentType: result.contentType,
    sniffed: mime,
    bytes: result.body.length,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    headers: headers ?? null,
  };
}

async function probeWithReferer(url: string) {
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "user-agent": "Mozilla/5.0",
      referer: "http://127.0.0.1:3000/admin/lab/real-assets/femicore",
    },
    signal: AbortSignal.timeout(12000),
  });
  return {
    url,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    bytes: Number(response.headers.get("content-length")),
    referer: "http://127.0.0.1:3000/admin/lab/real-assets/femicore",
  };
}

async function main() {
  const rows = [];
  for (const url of URLS) {
    rows.push(await probe(url));
    rows.push(await probeWithReferer(url));
  }
  const dest = path.join("data", "evidence", "execution-52a-image-gallery-fix");
  mkdirSync(dest, { recursive: true });
  writeFileSync(path.join(dest, "url-probes.json"), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
