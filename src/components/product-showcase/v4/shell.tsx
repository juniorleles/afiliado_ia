import React from "react";
import Link from "next/link";
import { COMPOSITIONS } from "@/lib/design-system/compose";
import { THEMES } from "@/lib/design-system/tokens";
import { DsTokenStyle } from "@/components/design-system/primitives";
import { V4Page } from "@/components/product-showcase/v4/page";
import type { V4Model } from "@/lib/product-showcase/v4/model";
import "@/app/design-system-lab.css";
import "@/app/renderer-v4-lab.css";

export function V4Shell({ model }: { model: V4Model }) {
  return (
    <div
      className="ds-root"
      data-ds-theme={model.theme}
      data-ds-composition={model.composition}
      data-ds-density={model.density}
      data-ds-sticky={model.sticky ? "on" : "off"}
      data-lab="renderer-v4"
      data-lab-scenario={model.scenarioKey}
      data-v4-status={model.blueprint.strategyStatus}
    >
      <DsTokenStyle />
      <a className="ds-skip" href="#hero">
        Skip to content
      </a>
      <div className="ds-labbar">
        <div className="ds-labbar__meta">
          <span>Lab · Renderer V4 · not published</span>
          <span>{model.scenarioKey}</span>
          <span>{COMPOSITIONS[model.composition].name}</span>
          <span>{THEMES[model.theme].label}</span>
          <span>{model.blueprint.conversionGoal}</span>
        </div>
        <Link href="/admin/lab/renderer-v4">All V4 scenarios</Link>
      </div>
      <div className="ds-topbar">
        <span className="ds-topbar__name">{model.contract.identity.productName}</span>
      </div>
      <V4Page model={model} />
    </div>
  );
}
