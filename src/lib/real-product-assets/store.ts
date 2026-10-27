import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AuthorizationEvent, DiscoveredImage, ProductCatalog } from "@/lib/real-product-assets/types";

export const DEFAULT_STORE_ROOT = path.join(process.cwd(), "data", "real-product-assets");

export function catalogDir(productKey: string, root = DEFAULT_STORE_ROOT): string {
  return path.join(root, productKey);
}

function catalogFile(productKey: string, root = DEFAULT_STORE_ROOT): string {
  return path.join(catalogDir(productKey, root), "catalog.json");
}

export function emptyCatalog(productKey: string, productName: string, now = new Date().toISOString()): ProductCatalog {
  return { productKey, productName, sourcePages: [], createdAt: now, updatedAt: now, images: [], events: [] };
}

export function readCatalog(productKey: string, root = DEFAULT_STORE_ROOT): ProductCatalog | null {
  const file = catalogFile(productKey, root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as ProductCatalog;
  } catch {
    return null;
  }
}

export function writeCatalog(catalog: ProductCatalog, root = DEFAULT_STORE_ROOT): void {
  const dir = catalogDir(catalog.productKey, root);
  mkdirSync(dir, { recursive: true });
  const next: ProductCatalog = { ...catalog, updatedAt: new Date().toISOString() };
  const dest = path.join(dir, "catalog.json");
  const tmp = path.join(dir, `catalog.json.tmp-${process.pid}`);
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  try {
    renameSync(tmp, dest);
  } catch {
    writeFileSync(dest, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore leftover tmp */
    }
  }
  catalog.updatedAt = next.updatedAt;
}

export function listCatalogs(root = DEFAULT_STORE_ROOT): ProductCatalog[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readCatalog(entry.name, root))
    .filter((item): item is ProductCatalog => Boolean(item));
}

export function appendEvent(catalog: ProductCatalog, event: AuthorizationEvent): ProductCatalog {
  return { ...catalog, events: [...catalog.events, event] };
}

export function upsertImage(catalog: ProductCatalog, image: DiscoveredImage): ProductCatalog {
  const images = catalog.images.filter((item) => item.id !== image.id && item.url !== image.url);
  return { ...catalog, images: [...images, image] };
}

export function mergeDiscoveredWithoutApproval(existing: ProductCatalog, discovered: DiscoveredImage[]): ProductCatalog {
  let next = existing;
  const pages = new Set(existing.sourcePages);
  for (const image of discovered) {
    const prior = existing.images.find((item) => item.id === image.id || item.url === image.url);
    if (prior) continue;
    next = upsertImage(next, {
      ...image,
      status: image.policyBlock ? "BLOCKED_BY_POLICY" : "PENDING_USER_APPROVAL",
      visualRole: "UNASSIGNED",
      localFile: null,
      sha256: null,
    });
    if (image.sourcePage) pages.add(image.sourcePage);
  }
  return { ...next, sourcePages: [...pages] };
}

export function latestEvent(catalog: ProductCatalog, imageId: string): AuthorizationEvent | undefined {
  return [...catalog.events].reverse().find((item) => item.imageId === imageId);
}

export function validApproval(catalog: ProductCatalog, url: string, scope = "LANDING_PAGE_LAB"): AuthorizationEvent | undefined {
  const events = catalog.events.filter((item) => item.originalUrl === url && item.scope === scope);
  const last = events[events.length - 1];
  if (!last) return undefined;
  return last.status === "USER_APPROVED" ? last : undefined;
}
