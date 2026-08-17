import Link from "next/link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
            Presell OS · Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Campanhas</h1>
        </div>
        <nav className="flex gap-4 text-sm text-zinc-400">
          <Link href="/" className="hover:text-zinc-100">
            Início
          </Link>
          <Link href="/admin" className="hover:text-zinc-100">
            Lista
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
