import React, { type ReactNode } from "react";
import { designSystemTokenCss } from "@/lib/design-system/tokens";

type Children = { children: ReactNode; className?: string };

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function DsContainer({ children, className, width = "wide" }: Children & { width?: "wide" | "content" | "narrow" }) {
  const extra = width === "content" ? "ds-container--content" : width === "narrow" ? "ds-container--narrow" : "";
  return <div className={cx("ds-container", extra, className)}>{children}</div>;
}

export function DsSection({
  id,
  children,
  className,
  tone = "plain",
  tight,
}: Children & { id?: string; tone?: "plain" | "alt" | "soft" | "accent"; tight?: boolean }) {
  return (
    <section
      id={id}
      className={cx("ds-section", tight && "ds-section--tight", tone !== "plain" && `ds-section--${tone}`, className)}
    >
      {children}
    </section>
  );
}

export function DsAutoGrid({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div className="ds-auto-grid" data-count={String(count)}>
      {children}
    </div>
  );
}

export function DsKicker({ children }: { children: ReactNode }) {
  return <p className="ds-kicker">{children}</p>;
}

export function DsCard({
  children,
  className,
  tone = "plain",
  featured,
}: Children & { tone?: "plain" | "soft" | "accent"; featured?: boolean }) {
  return (
    <div className={cx("ds-card", tone !== "plain" && `ds-card--${tone}`, featured && "ds-card--featured", className)}>
      {children}
    </div>
  );
}

export function DsPlaceholder({ mark, children }: { mark: string; children: ReactNode }) {
  return (
    <div className="ds-placeholder" role="status">
      <span className="ds-placeholder__mark">{mark}</span>
      <p className="ds-caption">{children}</p>
    </div>
  );
}

export function DsCta({
  href,
  label,
  disabled,
  onAccent,
}: {
  href?: string;
  label: string;
  disabled?: boolean;
  onAccent?: boolean;
}) {
  const className = cx("ds-btn", onAccent && "ds-btn--on-accent", disabled && "ds-btn--disabled");
  if (disabled || !href) {
    return (
      <span className={className} aria-disabled="true">
        {label}
      </span>
    );
  }
  return (
    <a className={className} href={href} rel="noopener noreferrer">
      {label}
    </a>
  );
}

/** Injects the token stylesheet once. Isolated from public CSS. */
export function DsTokenStyle() {
  return <style dangerouslySetInnerHTML={{ __html: designSystemTokenCss() }} />;
}
