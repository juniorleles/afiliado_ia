export const OPERATIONAL_STATUSES = [
  "DISCOVERED",
  "PENDING_USER_APPROVAL",
  "USER_APPROVED",
  "REJECTED",
  "BLOCKED_BY_POLICY",
  "REVOKED",
] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const VISUAL_ROLES = [
  "HERO",
  "PRIMARY_PRODUCT",
  "SECONDARY",
  "PROMO_BANNER",
  "SUPPORTING",
  "DETAIL",
  "UNASSIGNED",
] as const;
export type VisualRole = (typeof VISUAL_ROLES)[number];

export const PROBABLE_KINDS = [
  "packshot",
  "banner",
  "lifestyle",
  "logo",
  "infographic",
  "icon",
  "tracking",
  "other",
] as const;
export type ProbableKind = (typeof PROBABLE_KINDS)[number];

export type FetchFailure = {
  url: string;
  reason: string;
};

export type DiscoveredImage = {
  id: string;
  productKey: string;
  productName: string;
  url: string;
  sourcePage: string;
  fileName: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  byteLength: number | null;
  probableKind: ProbableKind;
  relevant: boolean;
  match: "CONFIRMED" | "PLAUSIBLE" | "UNCONFIRMED" | "CONTRADICTED";
  policyBlock: string | null;
  status: OperationalStatus;
  visualRole: VisualRole;
  localFile: string | null;
  sha256: string | null;
  discoveredAt: string;
};

export type AuthorizationEvent = {
  imageId: string;
  originalUrl: string;
  productKey: string;
  productName: string;
  sourcePage: string;
  actor: string;
  scope: "LANDING_PAGE_LAB";
  status: OperationalStatus;
  restrictions: string[];
  recordedAt: string;
  note: string;
};

export type ProductCatalog = {
  productKey: string;
  productName: string;
  sourcePages: string[];
  createdAt: string;
  updatedAt: string;
  images: DiscoveredImage[];
  events: AuthorizationEvent[];
};

export type DiscoveryReport = {
  productKey: string;
  productName: string;
  pages: Array<{ url: string; ok: boolean; status: number | null; reason: string | null; found: number }>;
  images: DiscoveredImage[];
  failures: FetchFailure[];
  reusedApprovals: string[];
};
