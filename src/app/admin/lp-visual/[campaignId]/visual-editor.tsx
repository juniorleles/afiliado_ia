"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { resetThemeAction, saveThemeTokenAction } from "@/app/admin/lp-visual/[campaignId]/actions";
import {
  FONT_FAMILIES,
  GENERATED_VISUAL_THEME,
  STYLE_OPTIONS,
  THEME_TOKENS,
  VISUAL_COMPONENTS,
  VISUAL_SECTIONS,
  previewThemeTokens,
  readThemeToken,
  resolveVisualTheme,
  themeStyleVars,
  type ThemeToken,
  type ThemeTokenOverride,
  type VisualSectionId,
} from "@/lib/lp-builder/theme";

export type VisualAuditItem = {
  id: number;
  scope: string;
  targetId: string;
  token: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  previousValue: string | null;
  newValue: string | null;
};

type PreviewLine = { section: VisualSectionId; component: string; text: string };

const LABELS: Record<ThemeToken, string> = {
  "colors.primary": "Primary color",
  "colors.secondary": "Secondary color",
  "colors.accent": "Accent color",
  "colors.background": "Background color",
  "colors.surface": "Surface color",
  "typography.fontFamily": "Font family",
  "typography.headingSize": "Heading size",
  "typography.bodySize": "Body size",
  "radii.button": "Button radius",
  "radii.card": "Card radius",
  "spacing.containerWidth": "Container width",
  "spacing.section": "Section spacing",
  "spacing.card": "Card spacing",
  "styles.button": "Button style",
  "styles.cta": "CTA style",
  "styles.badge": "Badge style",
  "styles.border": "Border style",
  "styles.shadow": "Shadow style",
  "styles.divider": "Divider style",
};

const SECTION_LABELS: Record<VisualSectionId, string> = {
  hero: "Hero",
  features: "Features",
  ingredients: "Ingredients",
  pricing: "Pricing",
  faq: "FAQ",
  guarantee: "Guarantee",
  warnings: "Warnings",
  manufacturer: "Manufacturer",
  footer: "Footer",
  closingCta: "Closing CTA",
};

function draftKey(scope: ThemeTokenOverride["scope"], targetId: string, token: ThemeToken): string {
  return `${scope}:${targetId}:${token}`;
}

function buttonStyle(kind: string, color: string, radius: string): CSSProperties {
  if (kind === "outline") return { background: "transparent", color, border: `1px solid ${color}`, borderRadius: radius };
  if (kind === "ghost") return { background: "transparent", color, border: "0", borderRadius: radius };
  return { background: color, color: "#ffffff", border: "0", borderRadius: radius };
}

function badgeStyle(kind: string, color: string): CSSProperties {
  if (kind === "outline") return { color, border: `1px solid ${color}`, borderRadius: "999px", padding: "0.1rem 0.45rem" };
  if (kind === "solid") return { background: color, color: "#ffffff", borderRadius: "999px", padding: "0.1rem 0.45rem" };
  return { background: color, color: "#ffffff", borderRadius: "999px", padding: "0.1rem 0.45rem", opacity: 0.85 };
}

export function VisualEditor({
  campaignId,
  saved,
  lines,
  initialAudit,
}: {
  campaignId: number;
  saved: ThemeTokenOverride[];
  lines: PreviewLine[];
  initialAudit: VisualAuditItem[];
}) {
  const [pending, startTransition] = useTransition();
  const [stored, setStored] = useState(saved);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState(initialAudit);
  const [sectionId, setSectionId] = useState<VisualSectionId>("hero");
  const [componentId, setComponentId] = useState("heading");
  const [scope, setScope] = useState<ThemeTokenOverride["scope"]>("theme");

  const preview = useMemo(() => previewThemeTokens(stored, drafts), [stored, drafts]);
  const resolved = useMemo(() => resolveVisualTheme({ tokens: preview.tokens }), [preview.tokens]);
  const targetId = scope === "theme" ? "theme" : scope === "section" ? sectionId : `${sectionId}/${componentId}`;
  const activeTheme = scope === "theme"
    ? resolved.theme
    : scope === "section"
      ? resolved.sections[sectionId]
      : resolved.components[`${sectionId}/${componentId}`] ?? resolved.sections[sectionId];

  function inherited(token: ThemeToken): string {
    if (scope === "theme") return readThemeToken(GENERATED_VISUAL_THEME, token);
    if (scope === "section") return readThemeToken(resolved.theme, token);
    return readThemeToken(resolved.sections[sectionId], token);
  }

  function currentValue(token: ThemeToken): string {
    const key = draftKey(scope, targetId, token);
    if (Object.prototype.hasOwnProperty.call(drafts, key)) return drafts[key] ?? "";
    return stored.find((row) => row.scope === scope && row.targetId === targetId && row.token === token)?.value ?? "";
  }

  function save(token: ThemeToken) {
    const value = currentValue(token);
    if (!value.trim()) return;
    startTransition(async () => {
      const result = await saveThemeTokenAction({ campaignId, scope, targetId, token, value });
      if (!result.ok) return;
      setStored((current) => {
        const next = current.filter((row) => !(row.scope === scope && row.targetId === targetId && row.token === token));
        next.push({ scope, targetId, token, value: result.value });
        return next;
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[draftKey(scope, targetId, token)];
        return next;
      });
      setAudit((current) => [result.audit, ...current]);
    });
  }

  function reset(nextScope?: ThemeTokenOverride["scope"], nextTarget?: string) {
    startTransition(async () => {
      const result = await resetThemeAction({ campaignId, scope: nextScope, targetId: nextTarget });
      if (!result.ok) return;
      setStored((current) => current.filter((row) => {
        if (!nextScope) return false;
        if (row.scope !== nextScope) return true;
        if (!nextTarget) return false;
        return row.targetId !== nextTarget;
      }));
      setDrafts((current) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(current)) {
          const [rowScope, rowTarget] = key.split(":");
          if (!nextScope || (rowScope === nextScope && (!nextTarget || rowTarget === nextTarget))) continue;
          next[key] = value;
        }
        return next;
      });
      if (result.audit) setAudit((current) => [result.audit!, ...current]);
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["theme", "section", "component"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={scope === item} onClick={() => setScope(item)} className={`rounded-md border px-3 py-1.5 text-sm capitalize ${scope === item ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-300"}`}>
              {item}
            </button>
          ))}
        </div>
        {scope !== "theme" ? (
          <label className="block text-xs text-zinc-500">
            Section
            <select value={sectionId} onChange={(event) => { const next = event.target.value as VisualSectionId; setSectionId(next); setComponentId(VISUAL_COMPONENTS[next][0] ?? "heading"); }} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              {VISUAL_SECTIONS.map((item) => <option key={item} value={item}>{SECTION_LABELS[item]}</option>)}
            </select>
          </label>
        ) : null}
        {scope === "component" ? (
          <label className="block text-xs text-zinc-500">
            Component
            <select value={componentId} onChange={(event) => setComponentId(event.target.value)} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
              {VISUAL_COMPONENTS[sectionId].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || scope !== "component"} onClick={() => reset("component", `${sectionId}/${componentId}`)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Reset component</button>
          <button type="button" disabled={pending || scope === "theme"} onClick={() => reset("section", sectionId)} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Reset section</button>
          <button type="button" disabled={pending} onClick={() => reset("theme", "theme")} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Reset theme</button>
          <button type="button" disabled={pending} onClick={() => { if (window.confirm("Remove every visual override?")) reset(); }} className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm disabled:opacity-40">Reset all visual overrides</button>
        </div>
        <div className="space-y-3">
          {THEME_TOKENS.map((token) => {
            const key = draftKey(scope, targetId, token);
            const value = currentValue(token);
            const error = preview.errors[key];
            const options = STYLE_OPTIONS[token as keyof typeof STYLE_OPTIONS];
            return (
              <label key={token} className="block text-xs text-zinc-500">
                {LABELS[token]}
                {token.startsWith("colors.") ? (
                  <span className="mt-1 flex gap-2">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : inherited(token)} aria-label={LABELS[token]} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="h-10 w-12 bg-transparent" />
                    <input value={value} placeholder={inherited(token)} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
                  </span>
                ) : token === "typography.fontFamily" ? (
                  <select value={value} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <option value="">Inherit</option>
                    {FONT_FAMILIES.map((font) => <option key={font} value={font}>{font}</option>)}
                  </select>
                ) : options ? (
                  <select value={value} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <option value="">Inherit</option>
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input value={value} placeholder={inherited(token)} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
                )}
                <span className="mt-1 block text-zinc-600">Effective {readThemeToken(activeTheme, token)}</span>
                {error ? <span className="mt-1 block text-red-300">{error}</span> : null}
                <button type="button" disabled={pending || !value.trim()} onClick={() => save(token)} className="mt-2 rounded-md bg-emerald-500 px-3 py-1 text-xs font-medium text-zinc-950 disabled:opacity-40">Save</button>
              </label>
            );
          })}
        </div>
        {resolved.warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-200" role="status">
            {resolved.warnings.slice(0, 8).map((warning) => (
              <li key={`${warning.scope}-${warning.targetId}-${warning.code}`}>{warning.message}</li>
            ))}
          </ul>
        ) : null}
        <section className="rounded-md border border-zinc-800 p-4">
          <h3 className="text-sm font-medium">Theme audit</h3>
          {audit.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No visual edits yet.</p> : (
            <ul className="mt-3 space-y-2 text-xs text-zinc-300">
              {audit.slice(0, 12).map((row) => (
                <li key={`${row.id}-${row.updatedAt}`} className="rounded-md border border-zinc-800 px-3 py-2">
                  <p>{row.scope} · {row.targetId} · {row.token} · v{row.version}</p>
                  <p className="text-zinc-500">{row.updatedBy} updated {row.updatedAt}</p>
                  <p>Previous: {row.previousValue ?? "—"}</p>
                  <p>New: {row.newValue ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="xl:sticky xl:top-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Live preview</p>
        <div data-visual-preview="1" className="lp-visual-preview max-h-[80vh] overflow-auto rounded-md border border-zinc-700" style={{ ...themeStyleVars(resolved), background: resolved.theme.colors.background, color: "#18181b", fontFamily: resolved.theme.typography.fontFamily, fontSize: resolved.theme.typography.bodySize }}>
          <style>{`.lp-visual-preview :focus-visible { outline: 2px solid var(--lp-accent); outline-offset: 2px; }`}</style>
          <div style={{ width: "100%", maxWidth: resolved.theme.spacing.containerWidth, margin: "0 auto" }}>
            {VISUAL_SECTIONS.map((item) => {
              const section = resolved.sections[item];
              const sectionLines = lines.filter((line) => line.section === item);
              const border = section.styles.border === "none" ? "0" : section.styles.border === "strong" ? "2px solid #18181b" : "1px solid #d4d4d8";
              const shadow = section.styles.shadow === "strong" ? "0 12px 30px rgb(0 0 0 / 0.18)" : section.styles.shadow === "soft" ? "0 6px 16px rgb(0 0 0 / 0.08)" : "none";
              return (
                <section key={item} data-preview-section={item} style={{ background: section.colors.surface, padding: section.spacing.section, marginBottom: section.styles.divider === "none" ? 0 : section.spacing.card, borderBottom: section.styles.divider === "line" ? "1px solid #d4d4d8" : "0" }}>
                  <p className="text-xs uppercase tracking-wide" style={{ color: section.colors.secondary }}>
                    <span style={badgeStyle(section.styles.badge, section.colors.accent)}>{SECTION_LABELS[item]}</span>
                  </p>
                  {sectionLines.map((line) => {
                    const component = resolved.components[`${item}/${line.component}`] ?? section;
                    if (line.component === "button") {
                      const kind = item === "hero" || item === "pricing" || item === "closingCta" ? component.styles.cta : component.styles.button;
                      return <p key={line.component} style={{ marginTop: component.spacing.card }}><button type="button" style={buttonStyle(kind, component.colors.primary, component.radii.button)}>{line.text}</button></p>;
                    }
                    if (line.component === "heading" || line.component === "question") {
                      return <h2 key={line.component} style={{ fontSize: component.typography.headingSize, marginTop: component.spacing.card }}>{line.text}</h2>;
                    }
                    return (
                      <p key={line.component} style={{ marginTop: component.spacing.card, background: line.component === "card" ? component.colors.background : "transparent", borderRadius: component.radii.card, border, boxShadow: line.component === "card" ? shadow : "none", padding: line.component === "card" ? component.spacing.card : undefined }}>
                        {line.component === "link" ? <a href="#preview" style={{ color: component.colors.accent }}>{line.text}</a> : line.text}
                      </p>
                    );
                  })}
                  {sectionLines.length === 0 ? <p style={{ marginTop: section.spacing.card }}>Section</p> : null}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
