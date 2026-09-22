"use client";

import { useActionState } from "react";
import Link from "next/link";
import { publishCampaignAction, type PublishFormState } from "@/app/admin/actions";
import type { PublicationGate } from "@/lib/policy-linter";

const initialState: PublishFormState = {};

type Props = {
  id: number;
  slug: string;
  gate: PublicationGate;
};

export function PublishPanel({ id, slug, gate }: Props) {
  const [state, formAction, pending] = useActionState(publishCampaignAction.bind(null, id), initialState);

  return (
    <div className="space-y-4">
      {state.error ? (
        <p className="rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200" role="alert">
          {state.error}
        </p>
      ) : null}

      {gate === "BLOCKED" ? (
        <p className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          PUBLICATION_GATE is BLOCKED. Publishing is refused. This is an
          internal risk decision — not a Google Ads verdict.
        </p>
      ) : null}

      {gate === "REVIEW_REQUIRED" ? (
        <p className="rounded-md border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          REVIEW_REQUIRED cannot publish. Confirming warnings does not make this
          READY. Resolve findings until the internal gate is READY.
        </p>
      ) : null}

      {gate === "READY" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          Internal gate is READY. Publishing still does not mean an ads
          platform approved this page.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/admin/${id}/lint`}
          className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Review findings
        </Link>
        <Link href="/admin" className="rounded-md border border-zinc-600 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800">
          Cancel
        </Link>
        {gate === "READY" ? (
          <form action={formAction}>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
            >
              {pending ? "Publishing…" : "Publish"}
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">Public URL after publish: /p/{slug}</p>
    </div>
  );
}
