/** URL-safe slug for the public route that arrives in Phase 4. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug: string): string | null {
  if (!slug) {
    return "Slug é obrigatório.";
  }
  if (slug !== slug.toLowerCase() || !SLUG_PATTERN.test(slug)) {
    return "Slug inválido: só minúsculas, números e hífen (sem espaço, sem acento). Exemplo: winter-jacket-review";
  }
  return null;
}
