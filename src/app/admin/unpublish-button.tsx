"use client";

import { unpublishCampaignAction } from "@/app/admin/actions";

export function UnpublishButton({ id, name }: { id: number; name: string }) {
  return (
    <form
      action={unpublishCampaignAction.bind(null, id)}
      onSubmit={(event) => {
        if (!window.confirm(`Retirar “${name}” da publicação? A página pública passa a responder 404. A prévia continua disponível.`)) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        role="menuitem"
        className="flex w-full rounded-ds-sm px-ds-12 py-ds-8 text-left text-body outline-none hover:bg-secondary focus-visible:shadow-ds-focus"
      >
        Retirar publicação
      </button>
    </form>
  );
}
