import { getDb } from "@/lib/db";
import { PUBLICATION_STATUS, type PublicationStatus } from "@/lib/publication";

const CAMPAIGN_COLUMNS = `id, name, slug, headline, body, ctaLabel, affiliateUrl, headScript, adHeadline, publicationStatus, publishedAt, createdAt, updatedAt, pageTemplate, pageComposition, productImageSrc, productImageProvenance, subheadline, sourceFactsJson, designPlanJson, visualTheme, designVersion, productAssetStatus, productAssetMetadata, creativeCompositionJson, creativeCompositionVersion`;

export type Campaign = {
  id: number;
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
  headScript: string | null;
  adHeadline: string | null;
  publicationStatus: PublicationStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pageTemplate?: string | null;
  pageComposition?: string | null;
  productImageSrc?: string | null;
  productImageProvenance?: string | null;
  subheadline?: string | null;
  sourceFactsJson?: string | null;
  designPlanJson?: string | null;
  visualTheme?: string | null;
  designVersion?: number | null;
  productAssetStatus?: string | null;
  productAssetMetadata?: string | null;
  creativeCompositionJson?: string | null;
  creativeCompositionVersion?: number | null;
};

export type CampaignInput = {
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
  headScript: string | null;
  adHeadline: string | null;
  pageTemplate?: string | null;
  pageComposition?: string | null;
  productImageSrc?: string | null;
  productImageProvenance?: string | null;
  subheadline?: string | null;
  sourceFactsJson?: string | null;
  designPlanJson?: string | null;
    visualTheme?: string | null;
    designVersion?: number | null;
    productAssetStatus?: string | null;
    productAssetMetadata?: string | null;
    creativeCompositionJson?: string | null;
    creativeCompositionVersion?: number | null;
  };

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`Já existe uma campanha com o slug "${slug}". Escolha outro.`);
    this.name = "SlugTakenError";
  }
}

function isUniqueSlugError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const code = "code" in err ? String(err.code) : "";
  const message = err instanceof Error ? err.message : "";
  return (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "SQLITE_CONSTRAINT" ||
    /UNIQUE constraint failed: campaigns\.slug/i.test(message)
  );
}

function normalizeCampaign(row: Campaign): Campaign {
  return {
    ...row,
    publicationStatus:
      row.publicationStatus === PUBLICATION_STATUS.PUBLISHED
        ? PUBLICATION_STATUS.PUBLISHED
        : PUBLICATION_STATUS.DRAFT,
    pageTemplate: row.pageTemplate ?? null,
    pageComposition: row.pageComposition ?? null,
    productImageSrc: row.productImageSrc ?? null,
    productImageProvenance: row.productImageProvenance ?? null,
    subheadline: row.subheadline ?? null,
    sourceFactsJson: row.sourceFactsJson ?? null,
    designPlanJson: row.designPlanJson ?? null,
    visualTheme: row.visualTheme ?? null,
    designVersion: row.designVersion ?? null,
    productAssetStatus: row.productAssetStatus ?? null,
    productAssetMetadata: row.productAssetMetadata ?? null,
    creativeCompositionJson: row.creativeCompositionJson ?? null,
    creativeCompositionVersion: row.creativeCompositionVersion ?? null,
  };
}

function pageFields(input: CampaignInput) {
  return {
    pageTemplate: input.pageTemplate ?? null,
    pageComposition: input.pageComposition ?? null,
    productImageSrc: input.productImageSrc ?? null,
    productImageProvenance: input.productImageProvenance ?? null,
    subheadline: input.subheadline ?? null,
    sourceFactsJson: input.sourceFactsJson ?? null,
    designPlanJson: input.designPlanJson ?? null,
    visualTheme: input.visualTheme ?? null,
    designVersion: input.designVersion ?? null,
    productAssetStatus: input.productAssetStatus ?? null,
    productAssetMetadata: input.productAssetMetadata ?? null,
    creativeCompositionJson: input.creativeCompositionJson ?? null,
    creativeCompositionVersion: input.creativeCompositionVersion ?? null,
  };
}

export function listCampaigns(): Campaign[] {
  return (
    getDb()
      .prepare(
        `SELECT ${CAMPAIGN_COLUMNS}
         FROM campaigns
         ORDER BY updatedAt DESC`,
      )
      .all() as Campaign[]
  ).map(normalizeCampaign);
}

export function getCampaignById(id: number): Campaign | undefined {
  const row = getDb()
    .prepare(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM campaigns
       WHERE id = ?`,
    )
    .get(id) as Campaign | undefined;
  return row ? normalizeCampaign(row) : undefined;
}

export function getCampaignBySlug(slug: string): Campaign | undefined {
  const row = getDb()
    .prepare(
      `SELECT ${CAMPAIGN_COLUMNS}
       FROM campaigns
       WHERE slug = ?`,
    )
    .get(slug) as Campaign | undefined;
  return row ? normalizeCampaign(row) : undefined;
}

export function listPublishedCampaigns(): Campaign[] {
  return listCampaigns().filter((campaign) => campaign.publicationStatus === PUBLICATION_STATUS.PUBLISHED);
}

export function getPublishedCampaignBySlug(slug: string): Campaign | undefined {
  const campaign = getCampaignBySlug(slug);
  if (!campaign || campaign.publicationStatus !== PUBLICATION_STATUS.PUBLISHED) {
    return undefined;
  }
  return campaign;
}

export function createCampaign(input: CampaignInput): Campaign {
  const now = new Date().toISOString();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO campaigns (name, slug, headline, body, ctaLabel, affiliateUrl, headScript, adHeadline, publicationStatus, publishedAt, createdAt, updatedAt, pageTemplate, pageComposition, productImageSrc, productImageProvenance, subheadline, sourceFactsJson, designPlanJson, visualTheme, designVersion)
         VALUES (@name, @slug, @headline, @body, @ctaLabel, @affiliateUrl, @headScript, @adHeadline, @publicationStatus, @publishedAt, @createdAt, @updatedAt, @pageTemplate, @pageComposition, @productImageSrc, @productImageProvenance, @subheadline, @sourceFactsJson, @designPlanJson, @visualTheme, @designVersion)`,
      )
      .run({
        ...input,
        ...pageFields(input),
        publicationStatus: PUBLICATION_STATUS.DRAFT,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      });

    const created = getCampaignById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error("Failed to read the campaign after insert.");
    }
    return created;
  } catch (err) {
    if (isUniqueSlugError(err)) {
      throw new SlugTakenError(input.slug);
    }
    throw err;
  }
}

export function updateCampaign(id: number, input: CampaignInput): Campaign {
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }

  const now = new Date().toISOString();
  const demotePublished = existing.publicationStatus === PUBLICATION_STATUS.PUBLISHED;
  const publicationStatus = demotePublished ? PUBLICATION_STATUS.DRAFT : existing.publicationStatus;
  const publishedAt = demotePublished ? null : existing.publishedAt;

  try {
    const result = getDb()
      .prepare(
        `UPDATE campaigns
         SET name = @name,
             slug = @slug,
             headline = @headline,
             body = @body,
             ctaLabel = @ctaLabel,
             affiliateUrl = @affiliateUrl,
             headScript = @headScript,
             adHeadline = @adHeadline,
             pageTemplate = @pageTemplate,
             pageComposition = @pageComposition,
             productImageSrc = @productImageSrc,
             productImageProvenance = @productImageProvenance,
             subheadline = @subheadline,
             sourceFactsJson = @sourceFactsJson,
             designPlanJson = @designPlanJson,
             visualTheme = @visualTheme,
             designVersion = @designVersion,
             publicationStatus = @publicationStatus,
             publishedAt = @publishedAt,
             updatedAt = @updatedAt
         WHERE id = @id`,
      )
      .run({
        name: input.name,
        slug: input.slug,
        headline: input.headline,
        body: input.body,
        ctaLabel: input.ctaLabel,
        affiliateUrl: input.affiliateUrl,
        headScript: input.headScript,
        adHeadline: input.adHeadline,
        ...pageFields({
          ...input,
          pageTemplate: input.pageTemplate !== undefined ? input.pageTemplate : existing.pageTemplate,
          pageComposition: input.pageComposition !== undefined ? input.pageComposition : existing.pageComposition,
          productImageSrc: input.productImageSrc !== undefined ? input.productImageSrc : existing.productImageSrc,
          productImageProvenance:
            input.productImageProvenance !== undefined
              ? input.productImageProvenance
              : existing.productImageProvenance,
          subheadline: input.subheadline !== undefined ? input.subheadline : existing.subheadline,
          sourceFactsJson: input.sourceFactsJson !== undefined ? input.sourceFactsJson : existing.sourceFactsJson,
          designPlanJson: input.designPlanJson !== undefined ? input.designPlanJson : existing.designPlanJson,
          visualTheme: input.visualTheme !== undefined ? input.visualTheme : existing.visualTheme,
          designVersion: input.designVersion !== undefined ? input.designVersion : existing.designVersion,
        }),
        publicationStatus,
        publishedAt,
        updatedAt: now,
        id,
      });

    if (result.changes === 0) {
      throw new Error("Campaign not found.");
    }

    const updated = getCampaignById(id);
    if (!updated) {
      throw new Error("Failed to read the campaign after update.");
    }
    return updated;
  } catch (err) {
    if (isUniqueSlugError(err)) {
      throw new SlugTakenError(input.slug);
    }
    throw err;
  }
}

/** Presentation-only. Does not rewrite copy or change publicationStatus. */
export function updateCampaignDesign(
  id: number,
  input: {
    designPlanJson: string;
    visualTheme: string;
    designVersion: number;
    productAssetStatus?: string | null;
    productAssetMetadata?: string | null;
  },
): Campaign {
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE campaigns
       SET designPlanJson = @designPlanJson,
           visualTheme = @visualTheme,
           designVersion = @designVersion,
           productAssetStatus = @productAssetStatus,
           productAssetMetadata = @productAssetMetadata,
           updatedAt = @updatedAt
       WHERE id = @id`,
    )
    .run({
      designPlanJson: input.designPlanJson,
      visualTheme: input.visualTheme,
      designVersion: input.designVersion,
      productAssetStatus: input.productAssetStatus ?? existing.productAssetStatus ?? null,
      productAssetMetadata: input.productAssetMetadata ?? existing.productAssetMetadata ?? null,
      updatedAt: now,
      id,
    });
  const updated = getCampaignById(id);
  if (!updated) {
    throw new Error("Failed to read the campaign after design update.");
  }
  return updated;
}

/** Presentation-only creative composition. Does not rewrite copy or publish. */
export function updateCampaignCreative(
  id: number,
  input: {
    creativeCompositionJson: string;
    creativeCompositionVersion: number;
  },
): Campaign {
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE campaigns
       SET creativeCompositionJson = @creativeCompositionJson,
           creativeCompositionVersion = @creativeCompositionVersion,
           updatedAt = @updatedAt
       WHERE id = @id`,
    )
    .run({
      creativeCompositionJson: input.creativeCompositionJson,
      creativeCompositionVersion: input.creativeCompositionVersion,
      updatedAt: now,
      id,
    });
  const updated = getCampaignById(id);
  if (!updated) {
    throw new Error("Failed to read the campaign after creative update.");
  }
  return updated;
}

/** Image/asset only. Does not publish or rewrite headline/body/CTA. */
export function updateCampaignProductAsset(
  id: number,
  input: {
    productImageSrc: string | null;
    productImageProvenance: string | null;
    productAssetStatus: string;
    productAssetMetadata: string | null;
    pageComposition: string | null;
  },
): Campaign {
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE campaigns
       SET productImageSrc = @productImageSrc,
           productImageProvenance = @productImageProvenance,
           productAssetStatus = @productAssetStatus,
           productAssetMetadata = @productAssetMetadata,
           pageComposition = @pageComposition,
           updatedAt = @updatedAt
       WHERE id = @id`,
    )
    .run({
      productImageSrc: input.productImageSrc,
      productImageProvenance: input.productImageProvenance,
      productAssetStatus: input.productAssetStatus,
      productAssetMetadata: input.productAssetMetadata,
      pageComposition: input.pageComposition,
      updatedAt: now,
      id,
    });
  const updated = getCampaignById(id);
  if (!updated) {
    throw new Error("Failed to read the campaign after product asset update.");
  }
  if (updated.publicationStatus !== existing.publicationStatus) {
    throw new Error("Product asset update must not change publication status.");
  }
  return updated;
}

export function publishCampaign(id: number): Campaign {
  // Persistence-only. Production UI must call tryPublish first
  // (publishCampaignAction). Tests may use this primitive directly.
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE campaigns
       SET publicationStatus = @publicationStatus,
           publishedAt = @publishedAt,
           updatedAt = @updatedAt
       WHERE id = @id`,
    )
    .run({
      publicationStatus: PUBLICATION_STATUS.PUBLISHED,
      publishedAt: now,
      updatedAt: now,
      id,
    });

  const updated = getCampaignById(id);
  if (!updated) {
    throw new Error("Failed to read the campaign after publish.");
  }
  return updated;
}

export function unpublishCampaign(id: number): Campaign {
  const existing = getCampaignById(id);
  if (!existing) {
    throw new Error("Campaign not found.");
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE campaigns
       SET publicationStatus = @publicationStatus,
           publishedAt = @publishedAt,
           updatedAt = @updatedAt
       WHERE id = @id`,
    )
    .run({
      publicationStatus: PUBLICATION_STATUS.DRAFT,
      publishedAt: null,
      updatedAt: now,
      id,
    });

  const updated = getCampaignById(id);
  if (!updated) {
    throw new Error("Failed to read the campaign after unpublish.");
  }
  return updated;
}

export function deleteCampaign(id: number): void {
  const result = getDb().prepare("DELETE FROM campaigns WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error("Campaign not found.");
  }
}

/**
 * Duplica uma campanha existente — copia todos os campos, gera slug único
 * automaticamente (`<slug>-copy`, `<slug>-copy-2`, ... até achar um livre —
 * reaproveita getCampaignBySlug pra checar, não confia em tentativa única).
 * Nome ganha sufixo "(copy)" pra distinguir na listagem.
 * Sempre nasce DRAFT, mesmo se a origem estiver published.
 */
export function duplicateCampaign(id: number): Campaign {
  const source = getCampaignById(id);
  if (!source) {
    throw new Error("Campaign not found.");
  }

  let candidateSlug = `${source.slug}-copy`;
  let suffix = 2;
  while (getCampaignBySlug(candidateSlug)) {
    candidateSlug = `${source.slug}-copy-${suffix}`;
    suffix += 1;
  }

  return createCampaign({
    name: `${source.name} (copy)`,
    slug: candidateSlug,
    headline: source.headline,
    body: source.body,
    ctaLabel: source.ctaLabel,
    affiliateUrl: source.affiliateUrl,
    headScript: source.headScript,
    adHeadline: source.adHeadline,
    pageTemplate: source.pageTemplate,
    pageComposition: source.pageComposition,
    productImageSrc: source.productImageSrc,
    productImageProvenance: source.productImageProvenance,
    subheadline: source.subheadline,
    sourceFactsJson: source.sourceFactsJson,
    designPlanJson: source.designPlanJson,
    visualTheme: source.visualTheme,
    designVersion: source.designVersion,
    productAssetStatus: source.productAssetStatus,
    productAssetMetadata: source.productAssetMetadata,
    creativeCompositionJson: source.creativeCompositionJson,
    creativeCompositionVersion: source.creativeCompositionVersion,
  });
}
