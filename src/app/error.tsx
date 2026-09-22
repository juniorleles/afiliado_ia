"use client";

export default function ErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="text-zinc-400">Please try again. If this continues, contact the site operator.</p>
    </main>
  );
}
