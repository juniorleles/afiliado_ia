export { AFFILIATE_HOP_VERSION } from "@/lib/affiliate-hop/types";
export type {
  ClickRecordResult,
  DestinationProbe,
  HopAuthorizationStatus,
  HopFormatResult,
  HopRecord,
  OfficialOfferClick,
  RedirectValidationStatus,
} from "@/lib/affiliate-hop/types";
export type { PreparedCta } from "@/lib/affiliate-hop/cta";
export { validateHopFormat, exactHopUnchanged } from "@/lib/affiliate-hop/format";
export { registerHop, markValidated, authorizeHop, ctaMayRender, productionPublicationBlocked } from "@/lib/affiliate-hop/authorize";
export { probeHopDestination } from "@/lib/affiliate-hop/probe";
export { prepareOfficialOfferCta, PREVIEW_CTA_LABEL } from "@/lib/affiliate-hop/cta";
export { recordOfficialOfferClick } from "@/lib/affiliate-hop/track";
export { readHopRecord, writeHopRecord, readClicks, DEFAULT_HOP_ROOT } from "@/lib/affiliate-hop/store";
