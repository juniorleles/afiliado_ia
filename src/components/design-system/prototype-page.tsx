import React from "react";
import type { ProductContract } from "@/lib/product-contract/types";
import type { CompositionId } from "@/lib/design-system/compose";
import { stickyCtaAllowed } from "@/lib/design-system/layout";
import { DsContainer, DsCta, DsSection } from "@/components/design-system/primitives";
import {
  BenefitList,
  CautionBlock,
  CommerceBar,
  CtaBlock,
  DetailsBand,
  FaqBlock,
  FeatureList,
  HeroCopy,
  ImageOrPlaceholder,
  LegalFooter,
  OfferBlock,
  TrustBlock,
  UsageBlock,
} from "@/components/design-system/contract-blocks";

function StickyCta({ contract }: { contract: ProductContract }) {
  if (!stickyCtaAllowed(contract) || !contract.cta.href || !contract.cta.label) return null;
  return (
    <div className="ds-sticky-cta" data-ds-sticky="1">
      <DsCta href={contract.cta.href} label={contract.cta.label} />
    </div>
  );
}

function HeroSeeOffer({ contract }: { contract: ProductContract }) {
  if (!contract.offer?.packages.length) return null;
  return (
    <a className="ds-btn ds-btn--ghost" href="#offer">
      See packages
    </a>
  );
}

function ProductHero({ contract }: { contract: ProductContract }) {
  return (
    <>
      <CommerceBar contract={contract} />
      <section className="ds-hero-band" id="hero">
        <DsContainer>
          <div className="ds-hero ds-hero--split">
            <div>
              <HeroCopy contract={contract} headingClass="ds-display" />
              <div className="ds-hero__actions">
                <HeroSeeOffer contract={contract} />
              </div>
            </div>
            <div className="ds-hero__media">
              <div className="ds-hero__stage">
                <ImageOrPlaceholder contract={contract} />
              </div>
            </div>
          </div>
        </DsContainer>
      </section>
      <FeatureList contract={contract} />
      <BenefitList contract={contract} />
      <DetailsBand contract={contract} />
      <UsageBlock contract={contract} />
      <OfferBlock contract={contract} withCta />
      <TrustBlock contract={contract} />
      <CautionBlock contract={contract} />
      <FaqBlock contract={contract} />
    </>
  );
}

function EditorialPremium({ contract }: { contract: ProductContract }) {
  return (
    <>
      <CommerceBar contract={contract} />
      <section className="ds-hero-band" id="hero">
        <DsContainer>
          <div className="ds-hero ds-hero--editorial">
            <HeroCopy contract={contract} headingClass="ds-display" />
          </div>
        </DsContainer>
      </section>
      {contract.images?.hero ? (
        <DsSection id="media" tight>
          <DsContainer width="narrow">
            <div className="ds-hero__stage">
              <ImageOrPlaceholder contract={contract} />
            </div>
          </DsContainer>
        </DsSection>
      ) : null}
      <FeatureList contract={contract} />
      <BenefitList contract={contract} />
      <DetailsBand contract={contract} />
      <UsageBlock contract={contract} />
      <CautionBlock contract={contract} />
      <TrustBlock contract={contract} />
      <FaqBlock contract={contract} />
      <OfferBlock contract={contract} tone="accent" withCta sectionId="cta" />
    </>
  );
}

function InformationFirst({ contract }: { contract: ProductContract }) {
  return (
    <>
      <section className="ds-hero-band ds-hero-band--compact" id="hero">
        <DsContainer>
          <div className="ds-hero ds-hero--info">
            <HeroCopy contract={contract} />
            <div className="ds-hero__actions">
              <CtaBlock contract={contract} />
            </div>
          </div>
        </DsContainer>
      </section>
      {!contract.features?.length && !contract.specifications?.length && !contract.components?.length ? (
        <DsSection id="facts" tone="alt" tight>
          <DsContainer width="content">
            <p className="ds-body ds-muted">The source provided a short description and little else.</p>
          </DsContainer>
        </DsSection>
      ) : (
        <div id="facts" hidden />
      )}
      <FeatureList contract={contract} />
      <DetailsBand contract={contract} />
      <BenefitList contract={contract} />
      <UsageBlock contract={contract} />
      <CautionBlock contract={contract} />
      <OfferBlock contract={contract} />
      <TrustBlock contract={contract} />
      <FaqBlock contract={contract} />
    </>
  );
}

export function PrototypePage({ contract, composition }: { contract: ProductContract; composition: CompositionId }) {
  return (
    <>
      <main>
        {composition === "product-hero" ? <ProductHero contract={contract} /> : null}
        {composition === "editorial-premium" ? <EditorialPremium contract={contract} /> : null}
        {composition === "information-first" ? <InformationFirst contract={contract} /> : null}
        <LegalFooter contract={contract} />
      </main>
      <StickyCta contract={contract} />
    </>
  );
}
