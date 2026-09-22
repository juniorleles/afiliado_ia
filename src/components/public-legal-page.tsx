import Link from "next/link";
import type { Metadata } from "next";
import { PublicFooter } from "@/components/public-footer";
import { getPublicSiteName, publicAbsoluteUrl } from "@/lib/public-site";

export function publicPageMetadata(path: string, title: string, description: string): Metadata {
  const site = getPublicSiteName();
  return {
    title: `${title} · ${site}`,
    description,
    alternates: { canonical: publicAbsoluteUrl(path) },
    robots: { index: true, follow: true },
  };
}

export function PublicLegalLayout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <article className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          <Link href="/" className="hover:underline">
            {getPublicSiteName()}
          </Link>
        </p>
        <h1 className="mt-2 text-4xl font-bold leading-tight text-zinc-50">{title}</h1>
        <div className="mt-8 space-y-4 text-base leading-relaxed text-zinc-300">{children}</div>
      </article>
      <PublicFooter />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="pt-4 text-2xl font-semibold text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}
