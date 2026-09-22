import Link from "next/link";
import { PUBLIC_FOOTER_LINKS, getPublicSiteName } from "@/lib/public-site";

export function PublicFooter() {
  return (
    <footer className="ps-footer mt-8 border-t border-zinc-800">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">Editorial disclosure</p>
          <p className="mt-2 text-xs text-zinc-500">{getPublicSiteName()}</p>
        </div>
        <nav aria-label="Site" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {PUBLIC_FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-zinc-400 underline-offset-2 hover:text-zinc-100 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
