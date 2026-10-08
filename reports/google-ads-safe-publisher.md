# Google Ads safe publisher — v3.2.0

Date: 2026-10-08

The publisher creates one Search campaign and keeps every new resource paused. A campaign that fails the local checks is not sent. A read-back that is not paused, or that shows impressions, clicks, or cost, is not stored as a success.

## Google Account

This installation has no selected Google Ads account. The OAuth environment names are still unset, so the wizard shows “Nenhuma conta ativa” and blocks the button. The verified publish used a fake Google transport and the customer id `3333333333`. No live account received a campaign.

When a stored login customer id is ten digits and differs from the selected account, the mutate and the read send that id in the `login-customer-id` header. A manager account is refused.

## Campaign Created

The fake transport accepted one paused Search campaign. The local campaigns table was unchanged. Campaign 184 stayed a draft and was not sent to Google. Maximize clicks and manual CPC were both built. Maximize clicks replaces the bid on this path only. The older campaign publisher still requires manual CPC.

## Campaign ID

The fake response returned campaign id `22`, ad group id `33`, and ad id `44`. Those ids, the resource names, and the zero delivery counters were stored in the temporary database. The production database has no publication row from this run.

## Resources Created

One mutate creates the budget, the Search campaign, the ad group, the responsive search ad, the keywords, and any sitelink, callout, or structured snippet already stored on the campaign. Location and language criteria are included. Every create status is `PAUSED`. The content network stays off. The payload refuses `ENABLED`, Performance Max, Shopping, and Display.

The test campaign carried broad, phrase, exact, and negative keywords, plus one sitelink, one callout, and one structured snippet. Headlines and descriptions were the strings supplied on the plan. No pin was sent.

## Validation

Before a mutate, the plan requires a campaign name, a selected non-manager account, a published HTTPS presell, a daily budget above zero, a language, a country, manual CPC or maximize clicks, at least three existing headlines of 30 characters or fewer, at least two existing descriptions of 90 characters or fewer, one non-negative keyword already stored on the campaign, and an internal policy gate of READY. A failed check returns issues and does not call Google.

On `/admin/184/google-ads` the button “Publicar pausada” is disabled. The page lists the missing account, the unpublished landing page, the headline limit, and the missing keywords. The publication panel links to the wizard. At 390px and 768px the page does not overflow horizontally.

After a mutate, the publisher reads the campaign for today. Success is stored only when the status is PAUSED and impressions, clicks, and cost are all zero. A second publish of the same local campaign and customer is refused.

## Known Limitations

Live Google was not called. This installation still has the OAuth environment names unset.

Copy, keywords, and assets are copied from fields and JSON that the campaign already stores. The Opportunity Engine does not keep a separate keyword list, so a campaign without stored keywords cannot be published. Assets are optional. Text that exceeds a Google limit is left out rather than shortened. Pinning stays available on the existing ad builder; this plan sends no pin.

Only a paused Search campaign is supported. One successful publication is stored for each local campaign and customer. Location and language criteria are created paused, so they do not apply until an operator changes them in Google Ads. The developer token and the access token are not stored and are not shown.

## Files Changed

- `src/lib/integrations/google-ads-publish/plan.ts`
- `src/lib/integrations/google-ads-publish/operations.ts`
- `src/lib/integrations/google-ads-publish/publish.ts`
- `src/lib/integrations/google-ads-publish/store.ts`
- `src/app/admin/[id]/google-ads/page.tsx`
- `src/app/admin/[id]/google-ads/actions.ts`
- `src/lib/db.ts`
- `src/components/layout/app-layout.tsx`
- `src/components/layout/navigation.ts`
- `src/app/admin/[id]/edit/workspace.tsx`
- `scripts/test-google-ads-safe-publisher.ts`

## Verification

`npx tsc --noEmit` passed. `scripts/test-google-ads-safe-publisher.ts`, `scripts/test-google-ads-oauth-foundation.ts`, and `scripts/test-google-ads-account-discovery.ts` passed. The wizard and the publication tab both returned HTTP 200. The publish button was not submitted.
