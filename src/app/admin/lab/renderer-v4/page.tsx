import type { Metadata } from "next";
import Link from "next/link";
import { COMPOSITIONS } from "@/lib/design-system/compose";
import { labScenarioSummaries } from "@/lib/design-system/scenarios";
import { DsTokenStyle } from "@/components/design-system/primitives";
import { buildV4Model } from "@/lib/product-showcase/v4/model";
import "@/app/design-system-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Renderer V4 lab",
  robots: { index: false, follow: false },
};

export default function RendererV4Index() {
  const rows = labScenarioSummaries().map((row) => {
    const model = buildV4Model(row.key)!;
    return {
      ...row,
      composition: model.composition,
      goal: model.blueprint.conversionGoal,
      hop: model.hopSlot,
      sections: model.blueprint.sections.filter((item) => item.renderEligibility === "ELIGIBLE").length,
    };
  });
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="renderer-v4">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab only · Renderer V4 · not a public page · not published</span>
        <Link href="/admin/lab/lp-generator">LP generator</Link>
        <Link href="/admin/lab/real-assets">Real product assets</Link>
        <Link href="/admin">Back to admin</Link>
      </div>
      <div className="ds-index">
        <h1>Universal Premium Renderer V4</h1>
        <p className="ds-muted">
          Six fictional scenarios. The renderer reads the Product Contract, Conversion Brief and Page Blueprint. Nothing
          here is a live campaign.
        </p>
        <table style={{ marginTop: "var(--ds-space-6)" }}>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Product (fictional)</th>
              <th>Composition</th>
              <th>Goal</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.fixtureId}</td>
                <td>{row.productName}</td>
                <td>{COMPOSITIONS[row.composition].name}</td>
                <td>{row.goal}</td>
                <td>
                  <Link href={`/admin/lab/renderer-v4/${row.key}`}>{row.key}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
