import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { PrototypeShell } from "@/components/prototype/shell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Protótipo de navegação",
  robots: { index: false, follow: false },
};

export default function PrototypeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.className} min-h-screen bg-background text-foreground antialiased`}>
      <PrototypeShell>{children}</PrototypeShell>
    </div>
  );
}
