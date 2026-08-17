import Link from "next/link";
import { DeleteButton } from "@/app/admin/delete-button";
import { listCampaigns } from "@/lib/campaigns";

export default function AdminPage() {
  const campaigns = listCampaigns();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">
          Persistência local SQLite. Sem rota pública nesta fase.
        </p>
        <Link
          href="/admin/new"
          className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-zinc-950"
        >
          Nova campanha
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-zinc-400">
          Nenhuma campanha ainda. Crie a primeira para validar o CRUD.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium">{campaign.name}</p>
                <p className="font-mono text-sm text-zinc-400">{campaign.slug}</p>
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href={`/admin/${campaign.id}/edit`}
                  className="text-sm text-emerald-400 hover:underline"
                >
                  Editar
                </Link>
                <DeleteButton id={campaign.id} name={campaign.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
