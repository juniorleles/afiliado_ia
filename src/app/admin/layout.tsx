import type { Metadata } from "next";
import Link from "next/link";
import { logoutAdminAction } from "@/app/admin/login/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-6 py-10 has-[[data-preview-wide]]:max-w-[1480px]">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
            Afiliado IA · Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Campanhas</h1>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-zinc-400">
          <Link href="/" className="hover:text-zinc-100">
            Início
          </Link>
          <Link href="/admin" className="hover:text-zinc-100">
            Lista
          </Link>
          <Link href="/admin/transactions" className="hover:text-zinc-100">
            Transações
          </Link>
          <Link href="/admin/system/readiness" className="hover:text-zinc-100">
            Readiness
          </Link>
          <Link href="/admin/validation" className="hover:text-zinc-100">
            Validation
          </Link>
          <Link href="/admin/discovery" className="hover:text-zinc-100">
            Discovery
          </Link>
          <form action={logoutAdminAction}>
            <button type="submit" className="hover:text-zinc-100">
              Sair
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
