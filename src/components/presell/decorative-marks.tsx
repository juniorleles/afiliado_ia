/**
 * Decorative marks keyed by presentation role and position.
 * They do not describe an ingredient, a feature, or a certification.
 */

import type { ReactNode } from "react";

type MarkRole = "ingredient" | "feature" | "shipping" | "savings" | "bonus";

function MarkFrame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" focusable="false" aria-hidden="true">
      {children}
    </svg>
  );
}

const INGREDIENT_MARKS = [
  <MarkFrame key="ring">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
  </MarkFrame>,
  <MarkFrame key="diamond">
    <path d="M12 4.5 19 12 12 19.5 5 12Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="square">
    <rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="dots">
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="16" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="16" r="1.5" fill="currentColor" />
    <circle cx="16" cy="16" r="1.5" fill="currentColor" />
  </MarkFrame>,
  <MarkFrame key="triangle">
    <path d="M12 5.5 19 18.5H5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="arcs">
    <path d="M6 15a6 6 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.5 15a3.5 3.5 0 0 1 7 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
];

const FEATURE_MARKS = [
  <MarkFrame key="plus">
    <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="bars">
    <path d="M6 16V10M12 16V7M18 16v-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </MarkFrame>,
  <MarkFrame key="wave">
    <path d="M4 13c2-4 4-4 6 0s4 4 6 0 4-4 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="corners">
    <path d="M8 5.5H5.5V8M16 5.5h2.5V8M8 18.5H5.5V16M16 18.5h2.5V16" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="stack">
    <circle cx="12" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="9" cy="15" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="15" cy="15" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
  <MarkFrame key="slash">
    <path d="M7 17 17 7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="16" cy="16" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </MarkFrame>,
];

export function DecorativeMark({ role, index }: { role: MarkRole; index: number }) {
  if (role === "shipping") {
    return (
      <MarkFrame>
        <path d="M3 8h11v7H3zM14 11h4l3 3v1h-7z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="7" cy="17.2" r="1.3" fill="currentColor" />
        <circle cx="17" cy="17.2" r="1.3" fill="currentColor" />
      </MarkFrame>
    );
  }
  if (role === "savings") {
    return (
      <MarkFrame>
        <path d="M8 5.5h8l3 3.2V18a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 18V7a1.5 1.5 0 0 1 1-1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12.5" r="1.3" fill="currentColor" />
      </MarkFrame>
    );
  }
  if (role === "bonus") {
    return (
      <MarkFrame>
        <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8.5v7M8.5 12h7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </MarkFrame>
    );
  }
  const marks = role === "ingredient" ? INGREDIENT_MARKS : FEATURE_MARKS;
  return marks[index % marks.length];
}
