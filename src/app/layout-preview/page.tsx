import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { isProduction } from "@/lib/env";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Layout Preview",
  robots: { index: false, follow: false },
};

const frames = [
  { title: "Desktop", width: 1280 },
  { title: "Tablet", width: 768 },
  { title: "Mobile", width: 390 },
] as const;

export default function LayoutPreviewPage() {
  if (isProduction()) notFound();

  return (
    <div lang="pt-BR" className="ds-page min-h-screen" style={inter.style}>
      <main className="ds-container py-ds-32">
        <h1 className="text-h1">Pré-visualização do layout</h1>
        <p className="mt-ds-8 max-w-content text-body text-muted-foreground">
          O mesmo console em desktop, tablet e mobile. Esta página não entra no menu.
        </p>
        <div className="mt-ds-32 flex flex-col gap-ds-32">
          {frames.map((frame) => (
            <section key={frame.title} className="flex flex-col gap-ds-12">
              <h2 className="text-h2">
                {frame.title}
                <span className="ml-ds-8 text-caption text-muted-foreground">{frame.width}px</span>
              </h2>
              <div className="overflow-x-auto rounded-ds-md border border-border bg-background">
                <iframe title={`Layout em ${frame.title}`} src="/dashboard" className="h-[720px] border-0" style={{ width: frame.width }} />
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
