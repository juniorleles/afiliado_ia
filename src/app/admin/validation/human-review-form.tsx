"use client";

import { useState } from "react";
import { humanReviewAction } from "@/app/admin/validation/actions";
import type { HumanReviewState } from "@/lib/validation/types";

export function HumanReviewForm({
  candidateId,
  current,
  notes,
}: {
  candidateId: string;
  current: HumanReviewState;
  notes: string;
}) {
  const [value, setValue] = useState(current);
  const [text, setText] = useState(notes);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void humanReviewAction(candidateId, value, text).finally(() => setBusy(false));
      }}
    >
      <select
        value={value}
        onChange={(e) => setValue(e.target.value as HumanReviewState)}
        className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
      >
        <option value="PENDING">PENDING</option>
        <option value="ACCEPTED">ACCEPTED</option>
        <option value="REJECTED">REJECTED</option>
      </select>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Notas (não publica)"
        className="min-w-[10rem] flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
      />
      <button type="submit" disabled={busy} className="rounded-md border border-zinc-600 px-2 py-1 text-xs">
        Guardar review
      </button>
    </form>
  );
}
