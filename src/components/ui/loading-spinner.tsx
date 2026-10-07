export function LoadingSpinner({ label = "Carregando" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-ds-8 text-body text-muted-foreground">
      <svg aria-hidden viewBox="0 0 16 16" className="h-ds-16 w-ds-16 motion-safe:animate-spin">
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      {label}
    </span>
  );
}
