import type { ReactNode } from "react";
import { listThemeOverrides } from "@/lib/lp-builder/theme-store";
import { resolveVisualTheme, themeStyleVars, type ThemeTokenOverride } from "@/lib/lp-builder/theme";

const THEME_CSS = `
.lp-theme { background: var(--lp-background); color: #18181b; font-family: var(--lp-font); font-size: var(--lp-body); }
.lp-theme .vm-page, .lp-theme .ps-page { background: var(--lp-background); font-family: var(--lp-font); }
.lp-theme h1, .lp-theme h2, .lp-theme .vm-display { font-family: var(--lp-font) !important; font-size: var(--lp-heading) !important; }
.lp-theme .vm-hero { background: var(--lp-hero-surface); padding-block: var(--lp-hero-section); }
.lp-theme [data-section-id="features"] { background: var(--lp-features-surface); }
.lp-theme [data-section-id="ingredients"] { background: var(--lp-ingredients-surface); }
.lp-theme [data-section-id="pricing"] { background: var(--lp-pricing-surface); }
.lp-theme [data-section-id="faq"] { background: var(--lp-faq-surface); }
.lp-theme [data-section-id="guarantee"] { background: var(--lp-guarantee-surface); }
.lp-theme [data-section-id="considerations"] { background: var(--lp-warnings-surface); }
.lp-theme .vm-footer { background: var(--lp-footer-surface); }
.lp-theme .vm-close { background: var(--lp-closingCta-surface); }
.lp-theme a { color: var(--lp-accent); }
.lp-theme a:focus-visible, .lp-theme button:focus-visible, .lp-theme .vm-cta:focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 2px; }
.lp-theme .vm-cta, .lp-theme .ps-cta { background: var(--lp-primary); color: #ffffff; border-radius: var(--lp-button-radius); }
`;

export function ThemeFrame({ campaignId, children }: { campaignId: number; children: ReactNode }) {
  const rows = listThemeOverrides(campaignId);
  if (rows.length === 0) return children;
  const tokens: ThemeTokenOverride[] = rows.flatMap((row) => {
    if (row.scope !== "theme" && row.scope !== "section" && row.scope !== "component") return [];
    return [{ scope: row.scope, targetId: row.targetId, token: row.token as ThemeTokenOverride["token"], value: row.value }];
  });
  const resolved = resolveVisualTheme({ tokens });
  return (
    <div className="lp-theme" style={themeStyleVars(resolved)}>
      <style>{THEME_CSS}</style>
      {children}
    </div>
  );
}
