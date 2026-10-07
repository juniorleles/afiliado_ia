import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-ds-sm bg-secondary motion-safe:animate-pulse", className)} />;
}
