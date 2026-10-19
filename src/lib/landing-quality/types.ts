export type QualityProblem = {
  code: string;
  sectionId: string;
  message: string;
  fixable: boolean;
};

export type LandingQualityScore = {
  copy: number;
  seo: number;
  evidence: number;
  compliance: number;
  persuasion: number;
  readability: number;
  trust: number;
  overall: number;
};

export type LandingQuality = {
  version: 1;
  campaignId: number;
  validatedAt: string;
  durationMs: number;
  stoppedBecause: "overall" | "attempts" | "evidence";
  score: LandingQualityScore;
  problems: QualityProblem[];
  approvedSections: string[];
  attempts: Record<string, number>;
};

export type AutoFixEntry = {
  attempt: number;
  sectionId: string;
  problems: string[];
  changed: boolean;
  note: string;
  durationMs: number;
  at: string;
};

export type AutoFixHistory = {
  version: 1;
  campaignId: number;
  entries: AutoFixEntry[];
};
