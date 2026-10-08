import { NextResponse } from "next/server";
import { isProduction } from "@/lib/env";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { prepareGoogleAdsConsent } from "@/lib/integrations/google-ads-oauth/flow";
import { GOOGLE_ADS_RETURN_COOKIE, GOOGLE_ADS_STATE_COOKIE, sealGoogleAdsReturn, sealGoogleAdsState } from "@/lib/integrations/google-ads-oauth/state-cookie";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE = "/configuracoes/integracoes/google-ads";
const OPERATIONS = "/admin/google-ads/operacoes";

function returnPath(request: Request): string {
  const referer = request.headers.get("referer");
  if (!referer) return PAGE;
  try {
    const url = new URL(referer);
    if (url.pathname === OPERATIONS) return OPERATIONS;
  } catch {
    return PAGE;
  }
  return PAGE;
}

function back(request: Request, notice: string): NextResponse {
  const url = new URL(PAGE, request.url);
  url.searchParams.set("aviso", notice);
  return NextResponse.redirect(url);
}

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimit(`gads-connect:${clientIp(request)}`, 10, 60_000);
  if (!limited.ok) return back(request, "sessao");
  if (!(await operatorMayManageGoogleAds())) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", PAGE);
    return NextResponse.redirect(login);
  }
  const prepared = prepareGoogleAdsConsent();
  if (!prepared.ok) return back(request, prepared.notice);
  const sealed = sealGoogleAdsState(prepared.state, prepared.verifier);
  if (!sealed) return back(request, "chave");
  const response = NextResponse.redirect(prepared.url);
  response.cookies.set({
    name: GOOGLE_ADS_STATE_COOKIE,
    value: sealed,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: PAGE,
    maxAge: 600,
  });
  const returning = sealGoogleAdsReturn(returnPath(request));
  if (returning) {
    response.cookies.set({
      name: GOOGLE_ADS_RETURN_COOKIE,
      value: returning,
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: PAGE,
      maxAge: 600,
    });
  }
  return response;
}
