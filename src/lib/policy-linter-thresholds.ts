/**
 * Configurable thresholds for Policy Linter V2.
 * Keep magic numbers here — not in UI components.
 */
export const LINT_THRESHOLDS = {
  content: {
    /** Below this, internal thin-content risk is a blocking fail. */
    minWordsFail: 20,
    /** Below this (but above fail), warn for thin-content risk. */
    minWordsWarn: 80,
    /** Fewer headings than this → warn (optional sections are OK; empty pages are not). */
    minHeadingsWarn: 2,
    /** Public template always renders 3 CTAs; flag if copy is too short relative to that. */
    publicCtaCount: 3,
    maxCtasPerHundredWordsWarn: 6,
  },
  adConsistency: {
    /** Ad vs page token overlap at or above this is acceptable. */
    minOverlapPass: 0.28,
    /** Below this with an ad headline set → fail (clearly unrelated). */
    minOverlapFail: 0.08,
  },
  language: {
    maxRepeatedPunctuation: 3,
  },
} as const;
