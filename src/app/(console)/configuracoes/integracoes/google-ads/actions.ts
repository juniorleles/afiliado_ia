"use server";

import { redirect } from "next/navigation";
import { operatorMayManageGoogleAds } from "@/lib/integrations/google-ads-oauth/access";
import { disconnectStoredGoogleAds, testStoredGoogleAdsConnection } from "@/lib/integrations/google-ads-oauth/flow";

const PAGE = "/configuracoes/integracoes/google-ads";

export async function disconnectGoogleAdsAction(): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  disconnectStoredGoogleAds();
  redirect(`${PAGE}?aviso=desconectado`);
}

export async function testGoogleAdsConnectionAction(): Promise<void> {
  if (!(await operatorMayManageGoogleAds())) redirect(`/admin/login?next=${encodeURIComponent(PAGE)}`);
  const notice = await testStoredGoogleAdsConnection();
  redirect(`${PAGE}?aviso=${notice}`);
}
