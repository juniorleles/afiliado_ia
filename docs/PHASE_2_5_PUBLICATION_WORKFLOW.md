# Phase 2.5 — Draft / Review / Publish workflow

This is an **internal publishing workflow**. It does not mean Google (or
any ads platform) approved a campaign. Policy Linter V2 remains a risk
assessment tool only.

Operational path:

**Create → Preview → Policy Check → Fix → Publish → Advertise**

## Lifecycle

```
DRAFT
  → Policy Check (READY | REVIEW_REQUIRED | BLOCKED)
  → human Publish (blocked if BLOCKED; confirm if REVIEW_REQUIRED)
  → PUBLISHED
  → optional Unpublish or Edit → DRAFT
```

`publication_status` is stored as `publicationStatus`: `draft` | `published`.
Optional `publishedAt` is set on publish and cleared on unpublish or on
edit of a live campaign.

There are no scheduled publishes, approval roles, or content versions.

## Migration

Same incremental SQLite pattern as `headScript` / `adHeadline`
(`PRAGMA table_info` + `ALTER TABLE`).

- Existing rows: `publicationStatus = 'published'`, `publishedAt = createdAt`.
  Live `/p/[slug]` URLs stay public. The database file is not deleted or
  recreated.
- New `INSERT`s: `createCampaign` always writes `draft` and `publishedAt = null`.
  Do not rely on the column default (`DEFAULT 'published'` exists only so
  ALTER can backfill old rows).

Migration is tested against a **temporary copy** of the old schema, not by
wiping `data/presell-os.db`.

## Draft behavior

- `/p/[slug]` → real **404** (same as an unknown slug).
- HTML metadata does not use the draft headline/description.
- `/admin/preview/[slug]` still renders the presell.
- Banner: **PREVIEW — NOT PUBLISHED** (preview only, never on the public page).
- Pixel does not run in preview.

## Publish behavior

Publish is an explicit admin action (`/admin/[id]/publish`). It runs
`tryPublish()` which calls the existing Policy Linter V2 engine — lint
rules are not duplicated in the UI.

| Gate | Publish |
|---|---|
| READY | Allowed |
| REVIEW_REQUIRED | Allowed only after explicit **Publish anyway** |
| BLOCKED | Refused |

AI generation and a passing lint do **not** publish by themselves.

## BLOCKED

Cannot publish. Operator must change copy (or other fields) and run Policy
Check again. The refusal is an internal risk decision, not an ads-platform
verdict.

## REVIEW_REQUIRED override

Warnings are not blocking fails. The publish page shows:

“This campaign has policy warnings. Review the findings before publishing.”

Actions: Review findings, Cancel, Publish anyway.

`confirmWarnings=1` is required. Tampering that flag does not publish a
BLOCKED campaign.

## Unpublish

Sets `draft`, clears `publishedAt`, keeps the row. `/p/[slug]` → 404.
Preview still works. Nothing else is deleted.

## Edit behavior

Saving a **published** campaign demotes it to **draft** (conservative:
any save, no content versioning). Admin shows:

“Campaign moved to Draft because published content was changed. Run Policy Check and publish again.”

The edit form warns before save. Draft edits stay draft.

## Duplicate behavior

Always `draft`, including when the source is published. Slug suffix
`-copy` / `-copy-2` is unchanged.

## AI generation behavior

Generate → pick variant → create campaign → **DRAFT**. Never auto-publish.

## Public vs preview

| | `/p/[slug]` | `/admin/preview/[slug]` |
|---|---|---|
| published | 200, pixel allowed | 200, no pixel, PREVIEW chrome |
| draft | 404 | 200, no pixel, PREVIEW — NOT PUBLISHED |
| unknown | 404 | 404 |

Same `CampaignTemplate`. No crawler/user-agent branching. No redirect to
admin for draft visitors.

## Limitations

- No scheduled publish, roles, or audit log of who published.
- Edit-to-draft is coarse (even a name-only save unpublishes).
- Gate is heuristic (see Policy Linter V2 docs). READY is not platform approval.
- `PRESELL_OS_DB` can point tests at a temp file; production uses
  `data/presell-os.db`.

This tool is an internal risk assessment / publishing system and does not
guarantee advertising-platform approval.
