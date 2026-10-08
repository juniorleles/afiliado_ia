import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isProduction } from "@/lib/env";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { acceptGoogleAdsAuthorizationCode } from "@/lib/integrations/google-ads-oauth/flow";
import { GOOGLE_ADS_RETURN_COOKIE, GOOGLE_ADS_STATE_COOKIE, openGoogleAdsReturn, openGoogleAdsState } from "@/lib/integrations/google-ads-oauth/state-cookie";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = "/configuracoes/integracoes/google-ads";

function back(request: Request, notice: string, returnTo = PAGE, googleError = ""): NextResponse {
  const url = new URL(returnTo, request.url);
  url.searchParams.set("aviso", notice);
  if (googleError) url.searchParams.set("erro", googleError);
  const response = NextResponse.redirect(url);
  for (const name of [GOOGLE_ADS_STATE_COOKIE, GOOGLE_ADS_RETURN_COOKIE]) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: PAGE,
      maxAge: 0,
    });
  }
  return response;
}

function googleErrorCode(value: string | null): string {
  const code = value?.trim() ?? "";
  return /^[a-z_]{1,40}$/.test(code) ? code : "";
}

export async function GET(request: Request): Promise<NextResponse> {
  const store = await cookies();
  const returnTo = openGoogleAdsReturn(store.get(GOOGLE_ADS_RETURN_COOKIE)?.value) ?? PAGE;
  const limited = rateLimit(`gads-return:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) return back(request, "sessao", returnTo);
  if (!(await operatorMayManageGoogleAds())) return back(request, "sessao", returnTo);
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";
  const googleError = googleErrorCode(url.searchParams.get("error"));
  if (googleError) return back(request, "google", returnTo, googleError);
  if (!code || !state) return back(request, "codigo", returnTo);
  const opened = openGoogleAdsState(store.get(GOOGLE_ADS_STATE_COOKIE)?.value);
  if (!opened || opened.state !== state) return back(request, "estado", returnTo);
  const notice = await acceptGoogleAdsAuthorizationCode({ code, codeVerifier: opened.verifier });
  return back(request, notice, returnTo);
}
