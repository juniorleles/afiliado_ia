import Link from "next/link";
import { DeleteButton } from "@/app/admin/delete-button";
import { DuplicateButton } from "@/app/admin/duplicate-button";
import { UnpublishButton } from "@/app/admin/unpublish-button";
import { listCampaigns } from "@/lib/campaigns";
import { lintCampaign, type PublicationGate } from "@/lib/policy-linter";

const GATE_CLASS: Record<PublicationGate, string> = {
  READY: "text-emerald-400",
  REVIEW_REQUIRED: "text-amber-400",
  BLOCKED: "text-red-400",
};

const NOTICE: Record<string, string> = {
  published: "Campaign is now published. /p/[slug] is public. This is not advertising-platform approval.",
  unpublished: "Campaign moved to Draft. Public /p/[slug] now returns 404. Preview still works.",
  "moved-to-draft":
    "Campaign moved to Draft because published content was changed. Run Policy Check and publish again.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const campaigns = listCampaigns();
  const noticeText = notice ? NOTICE[notice] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          New campaigns start as Draft. /p/[slug] is public only after an
          explicit Publish. Policy Check is an internal risk gate, not Google
          approval.
        </p>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/generate"
            className="rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/10"
          >
            Gerar com IA
          </Link>
          <Link
            href="/admin/validation"
            className="rounded-md border border-zinc-500 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Validation Lab
          </Link>
          <Link
            href="/admin/new"
            className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950"
          >
            Nova campanha
          </Link>
        </div>
      </div>

      {noticeText ? (
        <p
          className="rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100"
          role="status"
        >
          {noticeText}
        </p>
      ) : null}

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-zinc-400">
          Nenhuma campanha ainda. Crie a primeira para validar o CRUD.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {campaigns.map((campaign) => {
            const gate = lintCampaign(campaign).gate;
            const published = campaign.publicationStatus === "published";
            return (
              <li
                key={campaign.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{campaign.name}</p>
                  <p className="font-mono text-sm text-zinc-400">{campaign.slug}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-zinc-300">
                    Publication:{" "}
                    <span className={published ? "text-emerald-400" : "text-amber-400"}>
                      {published ? "PUBLISHED" : "DRAFT"}
                    </span>
                  </p>
                  <p className={`text-xs font-medium uppercase tracking-wide ${GATE_CLASS[gate]}`}>
                    Policy: {gate.replaceAll("_", " ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {published ? (
                    <Link
                      href={`/p/${campaign.slug}`}
                      className="text-sm text-zinc-300 hover:underline"
                    >
                      View
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/preview/${campaign.slug}`}
                      className="text-sm text-zinc-300 hover:underline"
                    >
                      Preview
                    </Link>
                  )}
                  <Link
                    href={`/admin/${campaign.id}/analytics`}
                    className="text-sm text-zinc-300 hover:underline"
                  >
                    Analytics
                  </Link>
                  <Link
                    href={`/admin/${campaign.id}/lint`}
                    className="text-sm font-medium text-emerald-400 hover:underline"
                  >
                    Policy Check
                  </Link>
                  <Link
                    href={`/admin/${campaign.id}/edit`}
                    className="text-sm text-emerald-400 hover:underline"
                  >
                    Edit
                  </Link>
                  {published ? (
                    <UnpublishButton id={campaign.id} name={campaign.name} />
                  ) : (
                    <Link
                      href={`/admin/${campaign.id}/publish`}
                      className="text-sm font-medium text-emerald-300 hover:underline"
                    >
                      Publish
                    </Link>
                  )}
                  <DuplicateButton id={campaign.id} />
                  <DeleteButton id={campaign.id} name={campaign.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
