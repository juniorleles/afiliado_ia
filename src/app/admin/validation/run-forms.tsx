"use client";

import { useState } from "react";
import {
  addExistingDraftAction,
  addImportedProductAction,
  generateProductAction,
  inspectRunAction,
  crossPageReviewAction,
} from "@/app/admin/validation/actions";

export function AddProductForms({
  runId,
  drafts,
  productKeys,
}: {
  runId: string;
  drafts: Array<{ id: number; name: string; slug: string }>;
  productKeys: string[];
}) {
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState("");

  async function wrap(label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(label);
    setError("");
    setInfo("");
    const result = await fn();
    setBusy("");
    if (!result.ok) setError(result.error || "failed");
    else {
      if (result.message) setInfo(result.message);
      window.location.reload();
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-4">
      <p className="text-sm font-medium">Adicionar produto real (não fabricar)</p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {info ? <p className="text-sm text-amber-200">{info}</p> : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const url = String(new FormData(form).get("url") || "");
          const name = String(new FormData(form).get("name") || "");
          void wrap(
            name.trim()
              ? `Searching the web for: ${name.trim()}`
              : "Checking primary source…",
            () => addImportedProductAction(runId, url, name),
          );
        }}
      >
        <input
          name="url"
          type="url"
          required
          placeholder="https://vendor.example/product"
          className="min-w-[16rem] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          name="name"
          placeholder="Nome (opcional)"
          className="w-48 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={Boolean(busy)}
          className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950"
        >
          Importar URL
        </button>
      </form>

      {drafts.length > 0 ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const id = Number(new FormData(event.currentTarget).get("campaignId"));
            void wrap("draft", () => addExistingDraftAction(runId, id));
          }}
        >
          <select name="campaignId" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name} ({draft.slug})
              </option>
            ))}
          </select>
          <button type="submit" disabled={Boolean(busy)} className="rounded-md border border-zinc-600 px-3 py-2 text-sm">
            Usar rascunho existente
          </button>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {productKeys.map((key) => (
          <button
            key={key}
            type="button"
            disabled={Boolean(busy)}
            className="rounded-md border border-emerald-500/50 px-3 py-2 text-xs text-emerald-300"
            onClick={() => void wrap(`gen-${key}`, () => generateProductAction(runId, key))}
          >
            Gerar 3 abordagens · {key}
          </button>
        ))}
        <button
          type="button"
          disabled={Boolean(busy)}
          className="rounded-md border border-zinc-600 px-3 py-2 text-xs"
          onClick={() => void wrap("inspect", () => inspectRunAction(runId))}
        >
          Visual + performance QA (localhost)
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          className="rounded-md border border-zinc-600 px-3 py-2 text-xs"
          onClick={() => void wrap("compare", () => crossPageReviewAction(runId))}
        >
          CROSS_PAGE AI review
        </button>
      </div>
      {busy ? <p className="text-xs text-zinc-500">A executar: {busy}</p> : null}
    </div>
  );
}
