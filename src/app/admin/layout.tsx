import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { logoutAdminAction } from "@/app/admin/login/actions";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

const inter = Inter({ subsets: ["latin"] });

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Administração",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div lang="pt-BR" className="ds-page min-h-screen" style={inter.style}>
      <AppLayout
        shell="admin"
        headerExtra={
          <form action={logoutAdminAction}>
            <Button type="submit" variant="ghost">Sair</Button>
          </form>
        }
      >
        {children}
      </AppLayout>
    </div>
  );
}
