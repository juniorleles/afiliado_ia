"use client";

import { duplicateCampaignAction } from "@/app/admin/actions";

export function DuplicateButton({ id }: { id: number }) {
  return (
    <form action={duplicateCampaignAction.bind(null, id)}>
      <button type="submit" className="text-sm text-zinc-300 hover:underline">
        Duplicate
      </button>
    </form>
  );
}
