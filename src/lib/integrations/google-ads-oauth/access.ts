/**
 * Google Ads connect, test, and disconnect require an admin session.
 */
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-session";
import { adminAuthBypassed } from "@/lib/access-policy";

export async function operatorMayManageGoogleAds(): Promise<boolean> {
  if (adminAuthBypassed()) return true;
  const store = await cookies();
  return verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
}
