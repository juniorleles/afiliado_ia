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
      <button
        type="submit"
        role="menuitem"
        className="flex w-full rounded-ds-sm px-ds-12 py-ds-8 text-left text-body text-danger outline-none hover:bg-secondary focus-visible:shadow-ds-focus"
      >
        Excluir
      </button>
    </form>
  );
}
