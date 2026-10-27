import type { CommercialImage } from "@/lib/product-showcase/v4/presentation";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import { isTechnicalPlaceholderImage } from "@/lib/product-showcase/v4/presentation";
import { storeApprovedFile } from "@/lib/real-product-assets/persist";
import { selectApprovedGallery, selectApprovedHero } from "@/lib/real-product-assets/select";
import { writeCatalog } from "@/lib/real-product-assets/store";
import type { DiscoveredImage, ProductCatalog } from "@/lib/real-product-assets/types";
import { DEFAULT_SANDBOX_ASSET_ROOT } from "@/lib/sandbox/store";

export function publicSandboxSrcFor(image: DiscoveredImage): string | null {
  if (image.status !== "USER_APPROVED") return null;
  if (!image.localFile) return null;
  if (isTechnicalPlaceholderImage(image.localFile, image.alt ?? undefined)) return null;
  return `/admin/lab/sandbox/file/${image.productKey}/${image.id}`;
}

export function overlaySandboxAssets(model: V4Model, catalog: ProductCatalog | null): V4Model {
  if (!catalog) return model;
  const hero = selectApprovedHero(catalog.images);
  const heroSrc = hero ? publicSandboxSrcFor(hero) : null;
  const commercialImage: CommercialImage | undefined = heroSrc
    ? { src: heroSrc, alt: `${catalog.productName} product image` }
    : undefined;
  const galleryImages = selectApprovedGallery(catalog.images)
    .map((item) => {
      const src = publicSandboxSrcFor(item);
      return src ? { src, alt: `${catalog.productName} product image` } : null;
    })
    .filter((item): item is CommercialImage => Boolean(item));
  return {
    ...model,
    commercialImage: commercialImage ?? model.commercialImage,
    galleryImages: galleryImages.length ? galleryImages : model.galleryImages,
    blueprint: {
      ...model.blueprint,
      images: {
        ...model.blueprint.images,
        hero: commercialImage
          ? { src: commercialImage.src, alt: commercialImage.alt, evidenceRefs: model.blueprint.images.hero?.evidenceRefs ?? [] }
          : model.blueprint.images.hero,
      },
    },
  };
}

/**
 * Copies selected images into an isolated fixture catalog and marks them
 * USER_APPROVED only there. The real catalog is never written.
 */
export async function simulateSandboxApprovals(input: {
  catalog: ProductCatalog;
  imageIds?: string[];
  limit?: number;
  root?: string;
  now?: string;
  persist?: typeof storeApprovedFile;
}): Promise<{ catalog: ProductCatalog; approved: string[]; skipped: string[] }> {
  const root = input.root ?? DEFAULT_SANDBOX_ASSET_ROOT;
  const now = input.now ?? new Date().toISOString();
  const persist = input.persist ?? storeApprovedFile;
  const limit = input.limit ?? 3;
  const candidates = (input.imageIds?.length
    ? input.catalog.images.filter((item) => input.imageIds!.includes(item.id))
    : input.catalog.images.filter((item) => item.relevant && !item.policyBlock && item.match !== "CONTRADICTED")
  ).slice(0, limit);

  const images: DiscoveredImage[] = [];
  const approved: string[] = [];
  const skipped: string[] = [];

  for (const image of input.catalog.images) {
    const chosen = candidates.find((item) => item.id === image.id);
    if (!chosen) {
      images.push({ ...image, status: image.status === "USER_APPROVED" ? "PENDING_USER_APPROVAL" : image.status });
      continue;
    }
    const stored = await persist(chosen, root);
    if (!stored.ok) {
      skipped.push(chosen.id);
      images.push({ ...image, status: "PENDING_USER_APPROVAL" });
      continue;
    }
    approved.push(chosen.id);
    images.push({
      ...stored.image,
      status: "USER_APPROVED",
      visualRole: stored.image.probableKind === "packshot" ? "PRIMARY_PRODUCT" : "SUPPORTING",
    });
  }

  const fixture: ProductCatalog = {
    ...input.catalog,
    images,
    events: [
      ...input.catalog.events,
      ...approved.map((imageId) => {
        const image = images.find((item) => item.id === imageId)!;
        return {
          imageId,
          originalUrl: image.url,
          productKey: input.catalog.productKey,
          productName: input.catalog.productName,
          sourcePage: image.sourcePage,
          actor: "sandbox-fixture",
          scope: "LANDING_PAGE_LAB" as const,
          status: "USER_APPROVED" as const,
          restrictions: ["SANDBOX_FIXTURE"],
          recordedAt: now,
          note: "Isolated sandbox approval. Not a real catalog USER_APPROVED status.",
        };
      }),
    ],
    updatedAt: now,
  };
  writeCatalog(fixture, root);
  return { catalog: fixture, approved, skipped };
}

export function realCatalogApprovalsUnchanged(before: ProductCatalog | null, after: ProductCatalog | null): boolean {
  const beforeIds = (before?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id).sort();
  const afterIds = (after?.images ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.id).sort();
  return JSON.stringify(beforeIds) === JSON.stringify(afterIds);
}
