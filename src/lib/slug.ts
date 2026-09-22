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

/**
 * Sugestão de slug a partir de um texto livre (nome de produto, por
 * exemplo) — usada na Fase 6 pra pré-preencher o campo antes do usuário
 * confirmar. Sempre passa por `validateSlug` depois, nunca é confiado
 * cegamente — isso aqui só poupa digitação.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acento (NFD separa a letra do diacrítico)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
