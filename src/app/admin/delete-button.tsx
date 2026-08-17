"use client";

import { deleteCampaignAction } from "@/app/admin/actions";

export function DeleteButton({ id, name }: { id: number; name: string }) {
  return (
    <form
      action={deleteCampaignAction.bind(null, id)}
      onSubmit={(event) => {
        if (!window.confirm(`Excluir a campanha “${name}”?`)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-red-400 hover:underline">
        Excluir
      </button>
    </form>
  );
}
