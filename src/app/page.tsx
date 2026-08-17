export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
        Presell OS · Phase 1
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">
        English-first presells. One URL for ads and buyers.
      </h1>
      <p className="text-lg text-zinc-400">
        This internal tool will publish review pages in English. Ads and
        visitors hit the same URL. The affiliate hop fires only when someone
        clicks the call-to-action — never as a hidden redirect.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-zinc-300">
        <li>Published pages: English only</li>
        <li>Ad final URL: this app&apos;s presell route (coming in Phase 4)</li>
        <li>Affiliate hop: only on an explicit CTA click (Phase 5)</li>
        <li>Ads and visitors see the same URL — no cloaking</li>
      </ul>
      <p>
        <a href="/admin" className="text-sm text-emerald-400 hover:underline">
          Internal admin →
        </a>
      </p>
    </main>
  );
}
