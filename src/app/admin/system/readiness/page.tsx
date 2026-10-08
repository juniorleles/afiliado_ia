import { SystemCenter, systemSection } from "@/app/admin/system/system-center";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ secao?: string | string[] }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  return <SystemCenter secao={systemSection(query.secao)} />;
}
