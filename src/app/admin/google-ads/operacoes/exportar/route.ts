import { NextResponse } from "next/server";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { REPORT_FILES } from "@/lib/integrations/google-ads-operations/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!(await operatorMayManageGoogleAds())) return NextResponse.redirect(new URL("/admin/login", request.url));
  const tipo = new URL(request.url).searchParams.get("tipo") ?? "";
  const build = tipo in REPORT_FILES ? REPORT_FILES[tipo as keyof typeof REPORT_FILES] : null;
  if (!build) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(build(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="google-ads-${tipo}.csv"`,
    },
  });
}
