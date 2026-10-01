import Link from "next/link";

const TABS = [
  { href: "/admin/discovery", label: "Dashboard" },
  { href: "/admin/discovery/sources", label: "Sources" },
  { href: "/admin/discovery/queue", label: "Queue" },
  { href: "/admin/discovery/scheduler", label: "Scheduler" },
  { href: "/admin/discovery/health", label: "Health" },
];

export default function DiscoveryAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-preview-wide className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-emerald-400">Opportunity Engine · Discovery</p>
        <h2 className="mt-1 text-2xl font-semibold">Discovery Admin</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Administration only. Nothing on these screens runs discovery, crawls, calls an API, or processes the queue.
          State is held in server memory and resets when the server restarts.
        </p>
      </div>
      <nav className="flex flex-wrap gap-4 border-b border-zinc-800 pb-2 text-sm">
        {TABS.map((tab) => (
          <Link key={tab.href} href={tab.href} className="text-emerald-400 hover:underline">
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
