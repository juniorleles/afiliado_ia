import React from "react";
import type { ProductContract } from "@/lib/product-contract/types";
import { purchaseCtaAllowed } from "@/lib/design-system/layout";
import { DsAutoGrid, DsCard, DsContainer, DsCta, DsKicker, DsPlaceholder, DsSection } from "@/components/design-system/primitives";

function present(contract: ProductContract, path: string): boolean {
  return contract.dataStates[path]?.state === "PRESENT" || contract.dataStates[path]?.state === "PARTIAL";
}

export function BrandLine({ contract }: { contract: ProductContract }) {
  const bits = [contract.identity.brand, contract.identity.productKind].filter(Boolean);
  if (bits.length === 0) return null;
  return <DsKicker>{bits.join(" · ")}</DsKicker>;
}

export function CommerceBar({ contract }: { contract: ProductContract }) {
  return (
    <div className="ds-topbar">
      <span className="ds-topbar__name">{contract.identity.productName}</span>
      {purchaseCtaAllowed(contract) && contract.cta.href && contract.cta.label ? (
        <DsCta href={contract.cta.href} label={contract.cta.label} />
      ) : null}
    </div>
  );
}

export function HeroChips({ contract }: { contract: ProductContract }) {
  const chips = contract.features?.slice(0, 3) ?? [];
  if (chips.length === 0) return null;
  return (
    <ul className="ds-hero-chips">
      {chips.map((item) => (
        <li key={item.text}>{item.text}</li>
      ))}
    </ul>
  );
}

export function FeatureList({ contract }: { contract: ProductContract }) {
  if (!contract.features?.length) return null;
  return (
    <DsSection id="features" tone="alt" tight>
      <DsContainer width="content">
        <h2 className="ds-h2">What it is</h2>
        {contract.features.length > 1 ? (
          <DsAutoGrid count={contract.features.length}>
            {contract.features.map((item, index) => (
              <div className="ds-feature" key={item.text}>
                <span className="ds-feature__n" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="ds-body">{item.text}</p>
              </div>
            ))}
          </DsAutoGrid>
        ) : (
          <ul className="ds-list">
            {contract.features.map((item) => (
              <li key={item.text}>{item.text}</li>
            ))}
          </ul>
        )}
      </DsContainer>
    </DsSection>
  );
}

function SpecTableInner({ contract }: { contract: ProductContract }) {
  if (!contract.specifications?.length) return null;
  return (
    <div id="specifications">
      <h2 className="ds-h2">Specifications</h2>
      <table className="ds-spec">
        <tbody>
          {contract.specifications.map((item) => (
            <tr key={item.name}>
              <th scope="row">{item.name}</th>
              <td>
                {item.value}
                {item.unit ? ` ${item.unit}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentListInner({ contract }: { contract: ProductContract }) {
  if (!contract.components?.length) return null;
  const role = contract.components[0]?.role;
  const heading = role === "INGREDIENT" ? "Declared composition" : role === "INCLUDED_ITEM" ? "What’s included" : "Components";
  return (
    <div id="components">
      <h2 className="ds-h2">{heading}</h2>
      <ul className="ds-list">
        {contract.components.map((item) => (
          <li key={item.name}>
            {item.name}
            {item.note ? <span className="ds-muted"> — {item.note}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpecTable({ contract }: { contract: ProductContract }) {
  if (!contract.specifications?.length) return null;
  return (
    <DsSection id="specifications-section" tight>
      <DsContainer width="content">
        <SpecTableInner contract={contract} />
      </DsContainer>
    </DsSection>
  );
}

export function ComponentList({ contract }: { contract: ProductContract }) {
  if (!contract.components?.length) return null;
  return (
    <DsSection id="components-section" tone="soft" tight>
      <DsContainer width="content">
        <ComponentListInner contract={contract} />
      </DsContainer>
    </DsSection>
  );
}

/** Specs and composition share one band when both exist, so the page does not stack two thin sections. */
export function DetailsBand({ contract }: { contract: ProductContract }) {
  const specs = contract.specifications?.length ?? 0;
  const comps = contract.components?.length ?? 0;
  if (!specs && !comps) return null;
  if (specs && comps) {
    return (
      <DsSection id="details" tone="soft" tight>
        <DsContainer width="content">
          <DsAutoGrid count={2}>
            <SpecTableInner contract={contract} />
            <ComponentListInner contract={contract} />
          </DsAutoGrid>
        </DsContainer>
      </DsSection>
    );
  }
  return specs ? <SpecTable contract={contract} /> : <ComponentList contract={contract} />;
}

export function BenefitList({ contract }: { contract: ProductContract }) {
  if (!contract.benefits?.length) return null;
  return (
    <DsSection id="benefits" tone="soft" tight>
      <DsContainer width="content">
        <h2 className="ds-h2">Seller-stated claims</h2>
        <p className="ds-caption" style={{ marginBottom: "var(--ds-space-4)" }}>
          The seller stated these. They are not independently verified.
        </p>
        <DsAutoGrid count={contract.benefits.length}>
          {contract.benefits.map((item) => (
            <div className="ds-feature" key={item.text}>
              <p className="ds-body">{item.text}</p>
            </div>
          ))}
        </DsAutoGrid>
      </DsContainer>
    </DsSection>
  );
}

export function UsageBlock({ contract }: { contract: ProductContract }) {
  if (!contract.usage?.length) return null;
  return (
    <DsSection id="usage" tone="alt" tight>
      <DsContainer width="content">
        <h2 className="ds-h2">How it is used</h2>
        <div className="ds-stack">
          {contract.usage.map((item) => (
            <p key={item.text} className="ds-body">
              {item.text}
            </p>
          ))}
        </div>
      </DsContainer>
    </DsSection>
  );
}

export function CautionBlock({ contract }: { contract: ProductContract }) {
  if (!contract.cautions?.length) return null;
  return (
    <DsSection id="cautions" tight>
      <DsContainer width="content">
        <h2 className="ds-h2">Cautions</h2>
        <div className="ds-notice">
          {contract.cautions.map((item) => (
            <p key={item.text} className="ds-body">
              {item.text}
            </p>
          ))}
        </div>
      </DsContainer>
    </DsSection>
  );
}

export function OfferBlock({
  contract,
  tone = "soft",
  withCta = false,
  sectionId = "offer",
}: {
  contract: ProductContract;
  tone?: "plain" | "alt" | "soft" | "accent";
  withCta?: boolean;
  sectionId?: string;
}) {
  const packages = contract.offer?.packages ?? [];
  if (packages.length === 0) {
    if (!present(contract, "offer.packages") && contract.dataStates["offer.packages"]?.state === "ABSENT") {
      return (
        <DsSection id={sectionId} tone={tone} tight>
          <DsContainer width="content">
            <DsPlaceholder mark="Offer">No verified price is available for this product.</DsPlaceholder>
            {!purchaseCtaAllowed(contract) ? <div className="ds-offer-cta"><CtaBlock contract={contract} onAccent={tone === "accent"} /></div> : null}
          </DsContainer>
        </DsSection>
      );
    }
    if (contract.dataStates["offer.packages"]?.state === "PARTIAL") {
      return (
        <DsSection id={sectionId} tone={tone} tight>
          <DsContainer width="content">
            <DsPlaceholder mark="Offer">A price was mentioned, but there is not enough commercial context to show it.</DsPlaceholder>
            {!purchaseCtaAllowed(contract) ? <div className="ds-offer-cta"><CtaBlock contract={contract} onAccent={tone === "accent"} /></div> : null}
          </DsContainer>
        </DsSection>
      );
    }
    if (withCta) {
      return (
        <DsSection id={sectionId} tone={tone} tight>
          <DsContainer width="content">
            <CtaBlock contract={contract} onAccent={tone === "accent"} />
          </DsContainer>
        </DsSection>
      );
    }
    return null;
  }
  return (
    <DsSection id={sectionId} tone={tone} tight>
      <DsContainer>
        <p className="ds-kicker">Offer</p>
        <h2 className="ds-h2">Choose a package</h2>
        <DsAutoGrid count={packages.length}>
          {packages.map((pack) => (
            <article className={pack.popularityLabel ? "ds-buy ds-buy--featured" : "ds-buy"} key={pack.label}>
              {contract.images?.hero ? (
                <div className="ds-buy__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={contract.images.hero.src} alt={contract.images.hero.alt} width={160} height={160} />
                </div>
              ) : null}
              {pack.popularityLabel ? <span className="ds-chip">{pack.popularityLabel}</span> : null}
              <h3 className="ds-h3">{pack.label}</h3>
              {pack.quantity ? <p className="ds-buy__qty">{pack.quantity.text}</p> : null}
              {pack.totalPrice ? (
                <p className="ds-price">
                  {pack.totalPrice}
                  {pack.originalPrice ? <span className="ds-price-was">{pack.originalPrice}</span> : null}
                </p>
              ) : null}
              {pack.unitPrice ? <p className="ds-caption">{pack.unitPrice}</p> : null}
              {pack.savings ? <p className="ds-caption">{pack.savings}</p> : null}
              {pack.shipping ? <p className="ds-caption">{pack.shipping}</p> : null}
              {pack.bonuses ? <p className="ds-caption">{pack.bonuses}</p> : null}
            </article>
          ))}
        </DsAutoGrid>
        {withCta ? (
          <div className="ds-offer-cta">
            <CtaBlock contract={contract} onAccent={tone === "accent"} />
          </div>
        ) : null}
      </DsContainer>
    </DsSection>
  );
}

export function CtaBlock({ contract, onAccent }: { contract: ProductContract; onAccent?: boolean }) {
  if (purchaseCtaAllowed(contract) && contract.cta.href && contract.cta.label) {
    return <DsCta href={contract.cta.href} label={contract.cta.label} onAccent={onAccent} />;
  }
  if (contract.cta.state === "PREVIEW_ONLY") {
    return <p className="ds-caption">The affiliate link is not authorized on this page, so the button does not go anywhere.</p>;
  }
  return <p className="ds-caption">No authorized affiliate link is available.</p>;
}

export function TrustBlock({ contract }: { contract: ProductContract }) {
  const returns = contract.operational?.returns ?? [];
  const shipping = contract.operational?.shipping ?? [];
  if (!contract.guarantee && returns.length === 0 && shipping.length === 0) return null;
  return (
    <DsSection id="trust" tone="alt" tight>
      <DsContainer width="content">
        <h2 className="ds-h2">Purchase details</h2>
        <DsAutoGrid count={(contract.guarantee ? 1 : 0) + returns.length + shipping.length}>
          {contract.guarantee ? (
            <div className="ds-guarantee">
              <h3 className="ds-h3">Guarantee</h3>
              <p className="ds-body">{contract.guarantee.text}</p>
            </div>
          ) : null}
          {returns.map((item) => (
            <DsCard key={item.statement}>
              <h3 className="ds-h3">Returns</h3>
              <p className="ds-body">{item.statement}</p>
            </DsCard>
          ))}
          {shipping.map((item) => (
            <DsCard key={item.statement}>
              <h3 className="ds-h3">Shipping</h3>
              <p className="ds-body">{item.statement}</p>
            </DsCard>
          ))}
        </DsAutoGrid>
      </DsContainer>
    </DsSection>
  );
}

export function FaqBlock({ contract }: { contract: ProductContract }) {
  if (!contract.faq?.length) return null;
  return (
    <DsSection id="faq" tight>
      <DsContainer width="narrow">
        <h2 className="ds-h2">Questions</h2>
        <div className="ds-faq">
          {contract.faq.map((item) => (
            <div className="ds-faq__item" key={item.question}>
              <h3 className="ds-h3">{item.question}</h3>
              <p className="ds-body">{item.answer}</p>
            </div>
          ))}
        </div>
      </DsContainer>
    </DsSection>
  );
}

export function LegalFooter({ contract }: { contract: ProductContract }) {
  return (
    <footer className="ds-footer" id="legal">
      <DsContainer width="content">
        <nav aria-label="Legal">
          {contract.legal.trustLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <p className="ds-caption">{contract.legal.affiliateDisclosure}</p>
        {contract.legal.healthDisclaimer ? <p className="ds-caption" style={{ marginTop: "var(--ds-space-3)" }}>{contract.legal.healthDisclaimer}</p> : null}
        {contract.legal.notices?.map((notice) => (
          <p key={notice} className="ds-caption" style={{ marginTop: "var(--ds-space-3)" }}>
            {notice}
          </p>
        ))}
      </DsContainer>
    </footer>
  );
}

export function ImageOrPlaceholder({
  contract,
  className,
}: {
  contract: ProductContract;
  className?: string;
}) {
  const hero = contract.images?.hero;
  if (hero) {
    return (
      <div className={className ?? "ds-hero__frame"}>
        {/* Synthetic fixture only. Never a third-party brand image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.src} alt={hero.alt} width={hero.width} height={hero.height} />
      </div>
    );
  }
  return (
    <DsPlaceholder mark="Image">
      No authorized product image is available, so this page does not invent one.
    </DsPlaceholder>
  );
}

export function HeroCopy({ contract, headingClass = "ds-h1" }: { contract: ProductContract; headingClass?: string }) {
  const supporting = contract.valueProposition?.supporting ?? [];
  return (
    <div>
      <BrandLine contract={contract} />
      <h1 className={headingClass}>{contract.identity.productName}</h1>
      {contract.valueProposition?.headline ? <p className="ds-lead">{contract.valueProposition.headline.text}</p> : null}
      <HeroChips contract={contract} />
      {contract.description ? <p className="ds-lead">{contract.description.text}</p> : null}
      {supporting.length > 0 ? (
        <div className="ds-stack" style={{ marginTop: "var(--ds-space-4)" }}>
          {supporting.map((item) => (
            <p key={item.text} className="ds-body ds-muted">
              {item.text}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
