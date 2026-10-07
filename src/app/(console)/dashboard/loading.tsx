import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="ds-container flex flex-col gap-ds-32 py-ds-24" aria-busy="true">
      <LoadingSpinner />
      <div className="flex flex-col gap-ds-8">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-5">
        {["search", "found", "promising", "test", "active"].map((key) => (
          <Skeleton key={key} className="h-24 w-full" />
        ))}
      </div>
      <div className="flex flex-wrap gap-ds-8">
        {["market", "campaign", "products", "reports"].map((key) => (
          <Skeleton key={key} className="h-10 w-40" />
        ))}
      </div>
      <div className="grid gap-ds-24 xl:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
