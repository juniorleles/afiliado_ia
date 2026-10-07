export const focusRing = "outline-none focus-visible:shadow-ds-focus";

export const disabledControl =
  "disabled:cursor-not-allowed disabled:bg-[var(--color-disabled-bg)] disabled:text-[var(--color-disabled-text)]";

export const fieldClass = [
  "w-full rounded-ds-sm border border-input bg-card px-ds-12 text-body text-foreground",
  "placeholder:text-muted-foreground",
  "aria-[invalid=true]:border-danger",
  focusRing,
  disabledControl,
].join(" ");
