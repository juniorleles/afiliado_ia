import type { Metadata } from "next";
import Link from "next/link";
import { COMPOSITION_IDS, COMPOSITIONS, pickComposition } from "@/lib/design-system/compose";
import { buildLabContract, labScenarioSummaries } from "@/lib/design-system/scenarios";
import { THEMES, type ThemeId } from "@/lib/design-system/tokens";
import { DsTokenStyle } from "@/components/design-system/primitives";
import "@/app/design-system-lab.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Design system lab",
  robots: { index: false, follow: false },
};

export default function DesignSystemLabIndex() {
  const rows = labScenarioSummaries().map((row) => {
    const contract = buildLabContract(row.key)!;
    return { ...row, recommended: pickComposition(contract), status: contract.status };
  });
  return (
    <div className="ds-root" data-ds-theme="ink" data-lab="design-system">
      <DsTokenStyle />
      <div className="ds-labbar">
        <span>Lab only · isolated prototypes · not a public page</span>
        <Link href="/admin">Back to admin</Link>
      </div>
      <div className="ds-index">
        <h1>Design system prototypes</h1>
        <p className="ds-muted">
          Six fictional scenarios × three compositions. Nothing here is a production renderer. No real campaign is
          published from this page.
        </p>
        <table style={{ marginTop: "var(--ds-space-6)" }}>
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Product (fictional)</th>
              <th>Recommended</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.fixtureId}</td>
                <td>{row.productName}</td>
                <td>{COMPOSITIONS[row.recommended].name}</td>
                <td>
                  <Link href={`/admin/lab/design-system/${row.key}`}>default</Link>
                  {" · "}
                  {COMPOSITION_IDS.map((id) => (
                    <span key={id}>
                      <Link href={`/admin/lab/design-system/${row.key}/${id}`}>{id}</Link>{" "}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2 className="ds-h2" style={{ marginTop: "var(--ds-space-8)" }}>
          Themes
        </h2>
        <p className="ds-muted">Palettes only. A theme is not a product category.</p>
        <ul>
          {(Object.keys(THEMES) as ThemeId[]).map((id) => (
            <li key={id}>
              {THEMES[id].label} ({THEMES[id].scheme})
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
