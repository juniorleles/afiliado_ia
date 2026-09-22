import { canRecordAnalytics } from "@/lib/analytics";
import { VALIDATION_ISOLATION, VALIDATION_SAFE_HREF } from "@/lib/validation/types";

export function validationAnalyticsAllowed(): boolean {
  return canRecordAnalytics({
    published: false,
    isPreview: true,
    skipHeader: true,
  });
}

export function validationRenderFlags() {
  return {
    renderPixel: VALIDATION_ISOLATION.renderPixel,
    trackClicks: VALIDATION_ISOLATION.trackClicks,
    disableAffiliateNavigation: VALIDATION_ISOLATION.disableAffiliateNavigation,
  };
}

export function isValidationSafeHref(href: string): boolean {
  return href === VALIDATION_SAFE_HREF || href.startsWith("#");
}

export function validationMustNotPublish(humanReview: string): boolean {
  return humanReview === "ACCEPTED" || humanReview === "REJECTED" || humanReview === "PENDING";
}
