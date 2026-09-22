"use client";

import { useActionState } from "react";
import type { CampaignInput } from "@/lib/campaigns";
import type { FormState } from "@/app/admin/actions";
import { parsePresellPage } from "@/lib/presell-page";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  // Aceita CampaignInput (não o Campaign completo) de propósito — Campaign
  // tem id/createdAt/updatedAt que essa tela não precisa, e a Fase 6
  // (geração via IA) precisa pré-preencher o formulário sem ter nenhum
  // desses 3 campos ainda (a campanha nem existe no banco). Todo Campaign
  // real já satisfaz esse tipo mais estreito, então nada quebra nas telas
  // que já passavam um Campaign completo (create/edit).
  campaign?: CampaignInput;
  submitLabel: string;
  unpublishOnSave?: boolean;
};

const initialState: FormState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-400">{message}</p>;
}

export function CampaignForm({ action, campaign, submitLabel, unpublishOnSave }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? campaign;
  const composed = parsePresellPage(values?.pageComposition ?? null);

  return (
    <form action={formAction} className="space-y-5" key={state.error ?? "ok"}>
      {state.error ? (
        <p
          className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <p className="text-sm text-zinc-400">
        Copy fields (headline, body, CTA) are English-only — they become the
        published presell later. Name is internal. Saving creates or updates a
        Draft; Publish is a separate action.
      </p>

      {unpublishOnSave ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100" role="status">
          This campaign is currently published. Saving will move it back to
          Draft. Run Policy Check and publish again before using the public URL.
        </p>
      ) : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Nome interno
        </span>
        <input
          name="name"
          defaultValue={values?.name}
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.name} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Slug
        </span>
        <input
          name="slug"
          defaultValue={values?.slug}
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="só minúsculas, números e hífen"
          placeholder="winter-jacket-review"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-zinc-100"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Vai virar /p/[slug] only after an explicit Publish. Só a-z, 0-9 e hífen.
        </span>
        <FieldError message={state.fieldErrors?.slug} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Headline (EN)
        </span>
        <input
          name="headline"
          defaultValue={values?.headline}
          required
          placeholder="Is this winter jacket actually worth it?"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.headline} />
      </label>

      {composed ? (
        <>
          <input type="hidden" name="pageComposition" value={values?.pageComposition ?? ""} />
          <input type="hidden" name="pageTemplate" value={values?.pageTemplate ?? composed.template} />
          <input type="hidden" name="productImageSrc" value={values?.productImageSrc ?? ""} />
          <input type="hidden" name="productImageProvenance" value={values?.productImageProvenance ?? ""} />
          <input type="hidden" name="sourceFactsJson" value={values?.sourceFactsJson ?? ""} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-300">Subheadline (EN)</span>
            <input
              name="subheadline"
              defaultValue={values?.subheadline ?? composed.hero.subheadline}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
            />
          </label>
          <fieldset className="rounded-md border border-zinc-800 px-3 py-3">
            <legend className="text-sm font-medium text-zinc-300">Section visibility</legend>
            <p className="mb-2 text-xs text-zinc-500">
              Template {composed.template}. Uncheck to omit a block. Missing facts stay omitted.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {composed.sections.map((section) => (
                <label key={section.id} className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" name={`sectionVisible_${section.id}`} value="1" defaultChecked={section.visible} />
                  {section.title}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {composed ? (
        <input type="hidden" name="body" value={values?.body ?? ""} />
      ) : (
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Body (EN)
        </span>
        <p className="mb-2 text-xs text-zinc-500">
          Restricted markdown: lines starting with{" "}
          <code className="rounded bg-zinc-800 px-1">## </code> become section
          headings, lines starting with{" "}
          <code className="rounded bg-zinc-800 px-1">- </code> become bullet
          points. Everything else is a paragraph. No bold/links/tables.
          Existing campaigns keep working with any subset of headings.
          Recommended (all optional): Introduction paragraphs, then{" "}
          <code className="rounded bg-zinc-800 px-1">## What Is …</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## Key Features</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## Who May Consider It?</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## Pros and Cons</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## Things to Consider</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## FAQ</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">## Final Thoughts</code>.
        </p>
        <textarea
          name="body"
          defaultValue={values?.body}
          required
          rows={12}
          placeholder={`Write the review in native English. No PT→EN translation tone.

This winter jacket is built for real cold, not just short trips outdoors.

## What Is Winter Jacket XT-200?

A mid-weight insulated jacket intended for commuting and daily winter wear.

## Key Features

- Keeps you warm down to -20C
- Machine washable

## Who May Consider It?

People who need a practical winter layer for walking or commuting.

## Pros and Cons

- Warm enough for most winter days
- Bulkier than a light shell

## Things to Consider

Fit can run large — check the size chart on the product page.

## FAQ

- Does it run true to size? Many buyers order their usual size.

## Final Thoughts

A straightforward winter jacket if you want warmth without dressy styling.`}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.body} />
      </label>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          CTA label (EN)
        </span>
        <input
          name="ctaLabel"
          defaultValue={values?.ctaLabel}
          required
          placeholder="Check current price"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.ctaLabel} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          URL de afiliado
        </span>
        <input
          name="affiliateUrl"
          type="url"
          defaultValue={values?.affiliateUrl}
          required
          placeholder="https://example.com/your-hop"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          O CTA aponta pra cá. UTM/gclid/fbclid da URL da presell são
          repassados automaticamente. Sem redirect automático — só dispara
          no clique de verdade.
        </span>
        <FieldError message={state.fieldErrors?.affiliateUrl} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Pixel / tracking script (opcional)
        </span>
        <p className="mb-2 text-xs text-zinc-500">
          Cole aqui o snippet completo do pixel (Meta, Google Ads, etc.).
          Só dispara na página pública real (<code className="rounded bg-zinc-800 px-1">/p/[slug]</code>)
          — nunca no preview do admin, pra não contar visualização/conversão
          enquanto você só está editando.
        </p>
        <textarea
          name="headScript"
          defaultValue={values?.headScript ?? ""}
          rows={4}
          placeholder={`<script>\n  fbq('init', 'YOUR_PIXEL_ID');\n  fbq('track', 'PageView');\n</script>`}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.headScript} />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Ad headline (opcional)
        </span>
        <p className="mb-2 text-xs text-zinc-500">
          A headline exata usada no anúncio (Google/Meta), se for diferente
          do headline da presell. Usado só pelo validador de política (Fase
          7) pra checar se a promessa do anúncio bate com o que a página
          entrega — não afeta o que é publicado.
        </p>
        <input
          name="adHeadline"
          defaultValue={values?.adHeadline ?? ""}
          placeholder="Deixe em branco se o anúncio usa o mesmo headline da presell"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.adHeadline} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-zinc-950 disabled:opacity-60"
      >
        {pending ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
