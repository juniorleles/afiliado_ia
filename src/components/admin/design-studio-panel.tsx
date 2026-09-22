"use client";

import { useRef, useState } from "react";
import type { VisualQaReport } from "@/lib/visual-qa/types";
import { HERO_VARIANTS, VISUAL_THEMES, type HeroVariant, type VisualTheme } from "@/lib/design/plan";
import { VisualQaPanel } from "@/components/admin/visual-qa-panel";

export function DesignStudioPanel({
  slug,
  template,
  contentGate,
  initialTheme,
  initialHero,
  initialReport,
  productAssetStatus,
  productAssetProvenance,
}: {
  slug: string;
  template: string;
  contentGate: string;
  initialTheme: string;
  initialHero: string;
  initialReport: VisualQaReport | null;
  productAssetStatus: string;
  productAssetProvenance: string;
}) {
  const [theme, setTheme] = useState<VisualTheme>(
    (VISUAL_THEMES as readonly string[]).includes(initialTheme) ? (initialTheme as VisualTheme) : "PREMIUM",
  );
  const [hero, setHero] = useState<HeroVariant>(
    (HERO_VARIANTS as readonly string[]).includes(initialHero) ? (initialHero as HeroVariant) : "MAGAZINE_PRODUCT",
  );
  const [busy, setBusy] = useState<"apply" | "optimize" | "upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iterations, setIterations] = useState(0);
  const [stop, setStop] = useState<string | null>(null);
  const [report, setReport] = useState<VisualQaReport | null>(initialReport);
  const [assetStatus, setAssetStatus] = useState(productAssetStatus);
  const [assetProvenance, setAssetProvenance] = useState(productAssetProvenance);
  const fileRef = useRef<HTMLInputElement>(null);

  async function post(action: "apply" | "optimize") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/design", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, action, theme, heroVariant: hero }),
      });
      const data = (await res.json()) as {
        error?: string;
        result?: {
          iterations: number;
          earlyStop: string;
          productAssetStatus?: string;
          productAssetProvenance?: string;
          heroVariant?: string;
        };
        report?: VisualQaReport;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setIterations(data.result?.iterations ?? 0);
      setStop(data.result?.earlyStop ?? null);
      if (data.result?.productAssetStatus) setAssetStatus(data.result.productAssetStatus);
      if (data.result?.productAssetProvenance) setAssetProvenance(data.result.productAssetProvenance);
      if (data.report) setReport(data.report);
      if (action === "apply") window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Design action failed");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File | null, action: "upload" | "remove") {
    setBusy(action === "remove" ? "remove" : "upload");
    setError(null);
    try {
      const form = new FormData();
      form.set("slug", slug);
      form.set("action", action);
      if (file) form.set("file", file);
      const res = await fetch("/api/admin/product-asset", { method: "POST", body: form });
      const data = (await res.json()) as {
        error?: string;
        result?: { productAssetStatus?: string; productAssetProvenance?: string };
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.result?.productAssetStatus) setAssetStatus(data.result.productAssetStatus);
      if (data.result?.productAssetProvenance) setAssetProvenance(data.result.productAssetProvenance);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Asset action failed");
    } finally {
      setBusy(null);
    }
  }

  const needsAsset = assetStatus === "NEEDS_ASSET";

  return (
    <section className="border-b border-zinc-800 bg-zinc-950 px-6 py-5" data-design-studio="1">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">Premium Art Direction</p>
      <div className="mt-3 flex flex-wrap gap-6 text-sm text-zinc-300">
        <p>
          template <strong className="text-zinc-50">{template}</strong>
        </p>
        <p>
          visual theme <strong className="text-zinc-50">{theme}</strong>
        </p>
        <p>
          hero <strong className="text-zinc-50">{hero}</strong>
        </p>
        <p>
          product asset <strong className="text-zinc-50">{assetStatus}</strong>
        </p>
        <p>
          provenance <strong className="text-zinc-50">{assetProvenance || "NOT_FOUND"}</strong>
        </p>
        <p>
          VISUAL QA <strong className="text-zinc-50">{report?.status ?? "—"}</strong>
        </p>
        <p>
          CONTENT GATE <strong className="text-zinc-50">{contentGate}</strong>
        </p>
        <p>
          iterations <strong className="text-zinc-50">{iterations}</strong>
          {stop ? ` · ${stop}` : ""}
        </p>
      </div>
      {needsAsset ? (
        <div className="mt-4 rounded-md border border-amber-700 bg-amber-950/60 px-4 py-3 text-sm text-amber-100" data-packshot-required="1">
          <p className="font-semibold tracking-wide">PRODUCT PACKSHOT REQUIRED</p>
          <p className="mt-1 text-amber-200/90">
            No suitable official product image was found from the supplied source. Upload an official product image or
            continue with a temporary visual placeholder.
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-400">
          Visual theme
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as VisualTheme)}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            {VISUAL_THEMES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Hero variant
          <select
            value={hero}
            onChange={(e) => setHero(e.target.value as HeroVariant)}
            className="mt-1 block rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            {HERO_VARIANTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void post("apply")}
          className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy === "apply" ? "Applying…" : "Apply Premium Design"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void post("optimize")}
          className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {busy === "optimize" ? "Optimizing…" : "Auto Optimize"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            if (file) void upload(file, "upload");
          }}
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy === "upload" ? "Uploading…" : needsAsset ? "Upload Product Image" : "Replace Product Image"}
        </button>
        {!needsAsset ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void upload(null, "remove")}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === "remove" ? "Removing…" : "Remove Product Image"}
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <p className="mt-3 text-xs text-zinc-500">
        Presentation only. Does not rewrite facts, loosen CONTENT_GATE, fire pixels, or publish. Production should
        persist product images in object storage rather than local disk.
      </p>
      <div className="mt-4 border-t border-zinc-800 pt-2">
        <VisualQaPanel slug={slug} initialReport={report} />
      </div>
    </section>
  );
}
