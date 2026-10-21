import React from "react";
import Link from "next/link";
import type { ProductContract } from "@/lib/product-contract/types";
import { COMPOSITIONS, type CompositionId } from "@/lib/design-system/compose";
import { pageDensity, stickyCtaAllowed } from "@/lib/design-system/layout";
import { THEMES, type ThemeId } from "@/lib/design-system/tokens";
import { DsTokenStyle } from "@/components/design-system/primitives";
import { PrototypePage } from "@/components/design-system/prototype-page";
import "@/app/design-system-lab.css";

export function PrototypeShell({
  contract,
  composition,
  theme,
  scenario,
}: {
  contract: ProductContract;
  composition: CompositionId;
  theme: ThemeId;
  scenario: string;
}) {
  return (
    <div
      className="ds-root"
      data-ds-theme={theme}
      data-ds-composition={composition}
      data-ds-density={pageDensity(contract)}
      data-ds-sticky={stickyCtaAllowed(contract) ? "on" : "off"}
      data-lab-scenario={scenario}
      data-lab="design-system"
    >
      <DsTokenStyle />
      <a className="ds-skip" href="#hero">
        Skip to content
      </a>
      <div className="ds-labbar">
        <div className="ds-labbar__meta">
          <span>Lab prototype</span>
          <span>{scenario}</span>
          <span>{COMPOSITIONS[composition].name}</span>
          <span>{THEMES[theme].label}</span>
          <span>{contract.status}</span>
        </div>
        <Link href="/admin/lab/design-system">All prototypes</Link>
      </div>
      <PrototypePage contract={contract} composition={composition} />
    </div>
  );
}
