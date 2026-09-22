"use client";

import { useState } from "react";
import type { Campaign } from "@/lib/campaigns";
import { CampaignTemplate } from "@/components/campaign-template";

export function PreviewFrame({ campaign }: { campaign: Campaign }) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const width = viewport === "mobile" ? 390 : 1440;

  const inner = <CampaignTemplate campaign={campaign} disableAffiliateNavigation />;

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 px-4 py-3">
        <button
          type="button"
          onClick={() => setViewport("desktop")}
          className={`rounded-md px-3 py-1.5 text-sm ${viewport === "desktop" ? "bg-emerald-500 text-zinc-950" : "border border-zinc-600 text-zinc-200"}`}
        >
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setViewport("mobile")}
          className={`rounded-md px-3 py-1.5 text-sm ${viewport === "mobile" ? "bg-emerald-500 text-zinc-950" : "border border-zinc-600 text-zinc-200"}`}
        >
          Mobile 390px
        </button>
      </div>
      <div className="overflow-x-auto bg-zinc-950 py-4">
        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
          style={{ width: viewport === "mobile" ? 390 : "100%", maxWidth: width, transform: "translateZ(0)" }}
        >
          {inner}
        </div>
      </div>
    </div>
  );
}
