import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  ANALYTICS_SKIP_HEADER,
  ANALYTICS_SKIP_VALUE,
  canRecordAnalytics,
  isCtaPosition,
  isValidClickId,
  isValidSessionId,
  SESSION_COOKIE,
  SESSION_HEADER,
} from "@/lib/analytics";
import { campaignIsPublished, recordClickSafe } from "@/lib/analytics-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const hdrs = await headers();
    if (hdrs.get(ANALYTICS_SKIP_HEADER) === ANALYTICS_SKIP_VALUE) {
      return new NextResponse(null, { status: 204 });
    }

    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? hdrs.get(SESSION_HEADER);
    if (!isValidSessionId(sessionId)) {
      return new NextResponse(null, { status: 204 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return new NextResponse(null, { status: 204 });
    }

    if (typeof payload !== "object" || payload === null) {
      return new NextResponse(null, { status: 204 });
    }

    const body = payload as Record<string, unknown>;
    const campaignId = Number(body.campaignId);
    const ctaPosition = body.ctaPosition;
    if (!isCtaPosition(ctaPosition)) {
      return new NextResponse(null, { status: 204 });
    }

    if (!campaignIsPublished(campaignId)) {
      return new NextResponse(null, { status: 204 });
    }

    if (
      !canRecordAnalytics({
        published: true,
        isPreview: false,
        skipHeader: false,
      })
    ) {
      return new NextResponse(null, { status: 204 });
    }

    const clickId = typeof body.clickId === "string" && isValidClickId(body.clickId) ? body.clickId : undefined;

    recordClickSafe({
      campaignId,
      sessionId: sessionId as string,
      ctaPosition,
      clickId,
    });
  } catch {
    console.error("[analytics] click endpoint failed");
  }

  return new NextResponse(null, { status: 204 });
}
