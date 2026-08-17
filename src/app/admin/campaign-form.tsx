"use client";

import { useActionState } from "react";
import type { Campaign } from "@/lib/campaigns";
import type { FormState } from "@/app/admin/actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  campaign?: Campaign;
  submitLabel: string;
};

const initialState: FormState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-400">{message}</p>;
}

export function CampaignForm({ action, campaign, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? campaign;

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
        published presell later. Name is internal.
      </p>

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
          Vai virar parte da URL pública na Fase 4. Só a-z, 0-9 e hífen.
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

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-zinc-300">
          Body (EN)
        </span>
        <textarea
          name="body"
          defaultValue={values?.body}
          required
          rows={8}
          placeholder="Write the review in native English. No PT→EN translation tone."
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
        <FieldError message={state.fieldErrors?.body} />
      </label>

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
          O hop só dispara no clique do CTA (Fase 5). Não há redirect
          automático.
        </span>
        <FieldError message={state.fieldErrors?.affiliateUrl} />
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
