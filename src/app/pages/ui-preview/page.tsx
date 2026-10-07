import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { isProduction } from "@/lib/env";
import { UiPreview } from "./ui-preview";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UI Preview",
  robots: { index: false, follow: false },
};

export default function UiPreviewPage() {
  if (isProduction()) notFound();
  return (
    <div lang="pt-BR" className="ds-page min-h-screen" style={inter.style}>
      <UiPreview />
    </div>
  );
}
