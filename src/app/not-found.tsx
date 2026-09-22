import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="text-sm uppercase tracking-widest text-zinc-500">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-zinc-400">That address is not a published page.</p>
      <p>
        <Link href="/" className="text-emerald-400 hover:underline">
          Home
        </Link>
      </p>
      <PublicFooter />
    </main>
  );
}
