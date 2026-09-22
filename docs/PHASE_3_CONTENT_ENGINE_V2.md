# Phase 3 — Presell Content Engine V2

AI-generated content must not be treated as evidence.
Product facts must come from imported or operator-provided information.

## Operator workflow

1. Enter product name, source URL, affiliate URL
2. Import facts (robots.txt is checked first) **or** continue with MANUAL PRODUCT FACTS
3. Review / edit facts (confidence + import warnings)
4. Generate Presells
5. Compare REVIEW / EDUCATIONAL / BUYER_GUIDE (each already linted)
6. Preview or select one
7. Confirm the existing campaign form → **DRAFT**
8. Existing flow: Preview → Policy Check → Publish

Generation never publishes.

## ProductFacts model

Session-only (`src/lib/product-facts.ts`). Not stored on the campaign row.

```
productName, sourceUrl, origin (IMPORTED | MANUAL)
description?, features[], ingredientsOrComponents[], usageInformation[]
cautions[], pricingInformation?, guaranteeInformation?, manufacturer?
sourceSnippets[], importWarnings[], confidence[field]
```

`SourceFact`: `{ field, text, sourceUrl, confidence }`

Confidence is categorical only (no numeric score):

- `DIRECT_SOURCE` — exact fact/evidence appears in source
- `HEURISTIC_EXTRACTION` — deterministic classifier associated source text with a field
- `AI_SOURCE_CLASSIFICATION` — AI classified supplied source text (not web research, not invented)
- `MANUAL` — operator supplied
- `NOT_FOUND` — omitted; never filled from model memory

Import quality (also categorical): `SUFFICIENT` | `PARTIAL` | `INSUFFICIENT`.

## Extraction logic

`extractProductFacts(html, sourceUrl, { operatorProductName })` in `src/lib/import-product.ts`:

- Strips `script`, `style`, `nav`, `footer`, `header`, in-page menus
- Product name: operator hint is canonical when present. Marketing/testimonial headings that merely contain the name (`Real … Users`, `Discover … Today`) do not replace it.
- Description: rejects generic metadata such as “Text Presentation”; prefers body statements of what the product is
- Walks `h1`–`h3` neighborhoods (paragraphs, cards, bold names, lists, FAQ Q&A), not only `ul`/`li`
- Guarantee requires a commercial term (duration / money-back / refund), not promotional “transform lives” copy
- Ignores navigation-like and hash-anchor menus
- Does **not** assume the first `<ul>` is product information

`importProductFromUrl` still fetches `robots.txt` first and throws
`RobotsDisallowedError` without bypassing. If deterministic quality is not
SUFFICIENT and the page text is substantial, an optional Anthropic
classification step may fill NOT_FOUND fields only when evidence is present
in the supplied text.

## Manual fallback

If robots block the path, fetch fails, HTML is empty, or almost nothing was
found: do not fabricate. The operator can enter MANUAL PRODUCT FACTS
(name, description, features, ingredients, usage, warnings, price, guarantee).
The operator is responsible for those values.

## AI restrictions

`buildPrompt` sends `formatFactsForPrompt(facts)`. Fields marked NOT_FOUND
are listed as omit-topics. The model may improve organization and English.
It must not invent ingredients, prices, discounts, guarantees, studies,
statistics, testimonials, customer counts, medical outcomes, certifications,
endorsements, awards, manufacturer claims, scarcity, or countdowns.

Pros restated from documented features only. Cons are factual caveats
(missing information, third-party merchant, pricing uncertainty).

## Variant approaches

Exactly three, never an urgency angle:

1. `REVIEW`
2. `EDUCATIONAL`
3. `BUYER_GUIDE`

Suggested sections are omitted when facts cannot support them (no empty
headings). CTA examples: Check Current Price / Visit Official Website /
View Product Details. Existing CTA hop behavior is unchanged.

## Policy integration

Each variant is passed through Policy Linter V2 (`lintVariant`) **before**
selection. The comparison UI shows gate, warning count, blocking count, and
major findings. BLOCKED variants remain visible and selectable. Publishing
is still refused by Phase 2.5 if the gate is BLOCKED.

## Source traceability

During the generate session the admin UI keeps source URL, origin,
import warnings, and fact fields. That trace is **not** written to the
public presell and **not** persisted on `campaigns` (no schema expansion).
After the operator leaves the flow, facts exist only in the created copy.

## Known limitations

- HTML heuristics still miss JS-only pages and PDFs.
- FAQ recognition is heading/Q&A based, not a full accordion parser for every template.
- Optional AI classification requires `ANTHROPIC_API_KEY` and still cannot invent facts.
- Longest-copy detection is a test helper, not a runtime filter.
- Facts are not stored with the published campaign.
- The model can still ignore instructions; the linter is the next gate.
