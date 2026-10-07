import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppLayout } from "@/components/layout/app-layout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Console",
  robots: { index: false, follow: false },
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="pt-BR" className="ds-page min-h-screen" style={inter.style}>
      <AppLayout>{children}</AppLayout>
    </div>
  );
}
