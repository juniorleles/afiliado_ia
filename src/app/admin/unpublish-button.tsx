"use client";

import { unpublishCampaignAction } from "@/app/admin/actions";

export function UnpublishButton({ id, name }: { id: number; name: string }) {
  return (
    <form
      action={unpublishCampaignAction.bind(null, id)}
      onSubmit={(event) => {
        if (!window.confirm(`Unpublish “${name}”? /p/[slug] will return 404. Preview stays available.`)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm text-amber-300 hover:underline">
        Unpublish
      </button>
    </form>
  );
}
