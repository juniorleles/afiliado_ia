import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { isProduction } from "@/lib/env";
import { UxPreview } from "./ux-preview";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UX Preview",
  robots: { index: false, follow: false },
};

export default function UxPreviewPage() {
  if (isProduction()) notFound();

  return (
    <div lang="pt-BR" className="ds-page min-h-screen" style={inter.style}>
      <UxPreview />
    </div>
  );
}
