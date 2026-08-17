import { getDb } from "@/lib/db";

export type Campaign = {
  id: number;
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = {
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
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

export function listCampaigns(): Campaign[] {
  return getDb()
    .prepare(
      `SELECT id, name, slug, headline, body, ctaLabel, affiliateUrl, createdAt, updatedAt
       FROM campaigns
       ORDER BY updatedAt DESC`,
    )
    .all() as Campaign[];
}

export function getCampaignById(id: number): Campaign | undefined {
  return getDb()
    .prepare(
      `SELECT id, name, slug, headline, body, ctaLabel, affiliateUrl, createdAt, updatedAt
       FROM campaigns
       WHERE id = ?`,
    )
    .get(id) as Campaign | undefined;
}

export function createCampaign(input: CampaignInput): Campaign {
  const now = new Date().toISOString();
  try {
    const result = getDb()
      .prepare(
        `INSERT INTO campaigns (name, slug, headline, body, ctaLabel, affiliateUrl, createdAt, updatedAt)
         VALUES (@name, @slug, @headline, @body, @ctaLabel, @affiliateUrl, @createdAt, @updatedAt)`,
      )
      .run({ ...input, createdAt: now, updatedAt: now });

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
  const now = new Date().toISOString();
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
             updatedAt = @updatedAt
         WHERE id = @id`,
      )
      .run({ ...input, updatedAt: now, id });

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

export function deleteCampaign(id: number): void {
  const result = getDb().prepare("DELETE FROM campaigns WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error("Campaign not found.");
  }
}
