import Script from "next/script";
import { parseMarkdown, type MarkdownBlock } from "@/lib/markdown";
import { buildAffiliateHref } from "@/lib/affiliate-url";
import { generateClickId } from "@/lib/analytics";
import { attachClickBankExtclid } from "@/lib/clickbank-hop";
import {
  HEALTH_DISCLAIMER_TEXT,
  TRUST_EDITORIAL,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";
import type { Campaign } from "@/lib/campaigns";
import { AffiliateCta } from "@/components/affiliate-cta";
import { parsePresellPage } from "@/lib/presell-page";
import { PresellPageView } from "@/components/presell/presell-page-view";

/**
 * Template Review — hero + disclosure de afiliado (sempre visível, nunca
 * condicional) + bloco editorial + corpo (parseado do campo `body`) + CTA.
 * A partir da Fase 5, o CTA tem `href` de verdade (`affiliateUrl` +
 * UTM/click-id repassados da URL de entrada) — sem redirect automático,
 * o hop só acontece se a pessoa clicar de verdade.
 *
 * Markdown continua restrito: o body nunca é interpretado como HTML.
 */

function renderBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case "heading":
      return (
        <h2 key={index} className="mt-10 text-2xl font-semibold text-zinc-50">
          {block.text}
        </h2>
      );
    case "paragraph":
      return (
        <p key={index} className="mt-4 leading-relaxed text-zinc-300">
          {block.text}
        </p>
      );
    case "list":
      return (
        <ul key={index} className="mt-4 space-y-2">
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2 text-zinc-300">
              <span className="mt-1 text-emerald-400" aria-hidden="true">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
  }
}

function outboundCta(baseHref: string, trackClicks: boolean): { href: string; clickId?: string } {
  if (!trackClicks) return { href: baseHref };
  const clickId = generateClickId();
  return { href: attachClickBankExtclid(baseHref, clickId), clickId };
}

function CtaButton({
  href,
  label,
  position,
  campaignId,
  trackClicks,
  clickId,
  disableAffiliateNavigation,
}: {
  href: string;
  label: string;
  position: "hero" | "middle" | "final";
  campaignId: number;
  trackClicks: boolean;
  clickId?: string;
  disableAffiliateNavigation?: boolean;
}) {
  return (
    <AffiliateCta
      href={href}
      label={label}
      position={position}
      campaignId={campaignId}
      trackClicks={trackClicks}
      clickId={clickId}
      disableAffiliateNavigation={disableAffiliateNavigation}
    />
  );
}

function TrustEditorialBlock() {
  return (
    <section
      className="mt-6 rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-4"
      aria-labelledby="how-we-review-heading"
    >
      <h2 id="how-we-review-heading" className="text-sm font-semibold text-zinc-100">
        {TRUST_EDITORIAL.heading}
      </h2>
      {TRUST_EDITORIAL.paragraphs.map((paragraph) => (
        <p key={paragraph} className="mt-2 text-sm leading-relaxed text-zinc-400">
          {paragraph}
        </p>
      ))}
    </section>
  );
}

function HealthDisclaimer() {
  if (!isHealthDisclaimerEnabled()) return null;
  return (
    <p className="mt-4 text-sm leading-relaxed text-zinc-500">{HEALTH_DISCLAIMER_TEXT}</p>
  );
}

export function CampaignTemplate({
  campaign,
  incomingQuery = "",
  renderPixel = false,
  trackClicks = false,
  disableAffiliateNavigation = false,
}: {
  campaign: Campaign;
  /** Query string from the public URL (no leading ?). Serializable across RSC. */
  incomingQuery?: string;
  /**
   * Só true na rota pública (/p/[slug]) — nunca no preview do admin, pra
   * não disparar pixel de conversão/visualização real enquanto alguém só
   * está editando/conferindo a campanha internamente.
   */
  renderPixel?: boolean;
  /** First-party CTA beacons. Never true on admin preview. */
  trackClicks?: boolean;
  /** Validation lab: CTA stays visible but must not hop to the affiliate URL. */
  disableAffiliateNavigation?: boolean;
}) {
  const incomingParams = new URLSearchParams(incomingQuery);
  const composed = parsePresellPage(campaign.pageComposition);
  if (composed) {
    return (
      <PresellPageView
        campaign={campaign}
        page={composed}
        incomingQuery={incomingQuery}
        renderPixel={renderPixel}
        trackClicks={trackClicks}
        disableAffiliateNavigation={disableAffiliateNavigation}
      />
    );
  }

  const blocks = parseMarkdown(campaign.body);
  const href = buildAffiliateHref(campaign.affiliateUrl, incomingParams);
  const heroCta = outboundCta(href, trackClicks);
  const middleCta = outboundCta(href, trackClicks);
  const finalCta = outboundCta(href, trackClicks);

  // "Vários CTAs (hero, meio, final)" — divide o corpo ao meio pra encaixar
  // o CTA do meio entre 2 blocos reais, não arbitrariamente na 1ª linha.
  const midpoint = Math.ceil(blocks.length / 2);
  const firstHalf = blocks.slice(0, midpoint);
  const secondHalf = blocks.slice(midpoint);

  return (
    <article className="mx-auto max-w-2xl px-6 py-14">
      {renderPixel && campaign.headScript && (
        <Script
          id="presell-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: campaign.headScript }}
        />
      )}

      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Review
        </p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-zinc-50">
          {campaign.headline}
        </h1>
      </header>

      <p className="mt-6 rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
        Disclosure: I may earn a commission if you purchase through links on
        this page.
      </p>

      <TrustEditorialBlock />
      <HealthDisclaimer />

      {/* CTA do hero — logo após o disclosure, antes de qualquer conteúdo */}
      <CtaButton
        href={heroCta.href}
        label={campaign.ctaLabel}
        position="hero"
        campaignId={campaign.id}
        trackClicks={trackClicks}
        clickId={heroCta.clickId}
        disableAffiliateNavigation={disableAffiliateNavigation}
      />

      <div>{firstHalf.map(renderBlock)}</div>

      {secondHalf.length > 0 && (
        <CtaButton
          href={middleCta.href}
          label={campaign.ctaLabel}
          position="middle"
          campaignId={campaign.id}
          trackClicks={trackClicks}
          clickId={middleCta.clickId}
          disableAffiliateNavigation={disableAffiliateNavigation}
        />
      )}

      <div>{secondHalf.map((block, i) => renderBlock(block, midpoint + i))}</div>

      <CtaButton
        href={finalCta.href}
        label={campaign.ctaLabel}
        position="final"
        campaignId={campaign.id}
        trackClicks={trackClicks}
        clickId={finalCta.clickId}
        disableAffiliateNavigation={disableAffiliateNavigation}
      />
    </article>
  );
}
