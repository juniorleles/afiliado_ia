import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isProduction } from "@/lib/env";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { acceptGoogleAdsAuthorizationCode } from "@/lib/integrations/google-ads-oauth/flow";
import { GOOGLE_ADS_STATE_COOKIE, openGoogleAdsState } from "@/lib/integrations/google-ads-oauth/state-cookie";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = "/configuracoes/integracoes/google-ads";

function back(request: Request, notice: string): NextResponse {
  const url = new URL(PAGE, request.url);
  url.searchParams.set("aviso", notice);
  const response = NextResponse.redirect(url);
  response.cookies.set({
    name: GOOGLE_ADS_STATE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: PAGE,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimit(`gads-return:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) return back(request, "sessao");
  if (!(await operatorMayManageGoogleAds())) return back(request, "sessao");
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  if (url.searchParams.get("error")) return back(request, "codigo");
  if (!code || !state) return back(request, "codigo");
  const store = await cookies();
  const opened = openGoogleAdsState(store.get(GOOGLE_ADS_STATE_COOKIE)?.value);
  if (!opened || opened.state !== state) return back(request, "estado");
  const notice = await acceptGoogleAdsAuthorizationCode({ code, codeVerifier: opened.verifier });
  return back(request, notice);
}
