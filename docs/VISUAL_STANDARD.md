# Visual Standard — PREMIUM_INTERNATIONAL

**TARGET_VISUAL_STANDARD = PREMIUM_INTERNATIONAL**

This is the quality bar for modern international-market product and
editorial presells in Presell OS. It is a **reference**, not permission
to copy any commercial website, brand, or layout pixel-for-pixel.

Visual QA (Phase 7) judges against this bar. It does **not** redesign
pages. Phase 8 will consume structured findings to apply safe visual
corrections later.

A page can be **technically functional** (no overflow, valid HTML, a
high Lighthouse score) and still fail Visual QA because it is not
**visually ready**.

---

## What PREMIUM_INTERNATIONAL means

A ready page should feel like a professional consumer product/editorial
experience for an international English-speaking audience:

- **Strong product-focused hero** — the product is identifiable in the
  first screen, with a clear focal point.
- **Large, confident typography** — the headline dominates; supporting
  copy is concise; type scale expresses hierarchy.
- **Clean modern composition** — alignment, spacing, and grouping look
  intentional rather than stacked documentation.
- **Intentional color palette** — restrained, consistent, with enough
  contrast; section backgrounds vary on purpose.
- **Product imagery integrated into the composition** — a real packshot
  or official product visual, not a labeled empty box.
- **Generous whitespace** — breathing room between sections; density
  serves scanning, not archival completeness.
- **Editorial / product storytelling** — the page leads the eye through
  a sequence, not a dump of equally weighted blocks.
- **Alternating section compositions** — rhythm: hero, facts, narrative,
  proof, close. Not one repeated card grid.
- **Visual fact presentation** — ingredients, usage, and guarantee are
  easy to spot without reading a wall of prose.
- **Ingredient presentation** that is scannable (short cards or a
  compact list), not a huge identical matrix.
- **Restrained CTA strategy** — a visible hero CTA, at most one
  mid-content CTA, one closing CTA, sticky mobile only on small screens.
  No clutter of equally dominant buttons.
- **Responsive mobile art direction** — composition is redesigned for
  390-wide, not a squeezed desktop column.
- **Strong visual hierarchy** — primary information wins; secondary
  detail recedes or collapses.
- **Professional footer / trust treatment** — disclosure, About,
  Contact, Privacy, Terms, Affiliate Disclosure; editorial context;
  health disclaimer when applicable. No fake trust badges.
- **Scannable content** — short blocks, clear headings, progressive
  disclosure for long secondary material.

Different templates express the same bar differently:

| Template | Feel |
|---|---|
| `REVIEW` | Editorial / product evaluation |
| `BUYER_GUIDE` | Product + decision-support |
| `EDITORIAL` | Publication / wellness editorial |

Do not score all three as identical ecommerce landing pages.

---

## Negative quality bar (undesirable)

Visual QA should flag candidates such as:

- documentation-like page
- wall of text
- wall of cards
- identical repeated cards
- tiny product presentation
- placeholder dominating the hero
- weak typography / flat type scale
- no visual storytelling
- flat single-background page
- CTA clutter or two CTAs stacked without purpose
- huge visible secondary information (overview, FAQ dumps)
- desktop layout merely squeezed into mobile
- poor image usage (banner mistaken for packshot, distortion, missing alt)
- fake ratings, reviews, badges, endorsements, certifications, scarcity,
  “someone just purchased”, or countdowns

These patterns are **generic**. They must not be hardcoded as
ProDentim-only production rules.

---

## Visual QA vs content safeguards

| Gate | Owner | Values |
|---|---|---|
| `CONTENT_GATE` | Policy Linter V2 + Grounding | `READY` / `REVIEW_REQUIRED` / `BLOCKED` |
| `VISUAL_QA_GATE` | Phase 7 Visual QA | `PASS` / `REVIEW_REQUIRED` |

Visual QA never loosens a content `BLOCKED`. It never auto-publishes.
Missing multimodal AI is `REVIEW_REQUIRED`, never `PASS`.

---

## Production notes (screenshots)

Screenshots are temporary files under `data/visual-qa-tmp/` (gitignored
with the rest of `data/`). SQLite stores the structured report JSON
only — not image blobs. In production, use a short-lived object store or
ephemeral disk; do not put multi-megabyte JPEGs in SQLite.
