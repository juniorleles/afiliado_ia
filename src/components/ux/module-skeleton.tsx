import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";

export type ModuleSkeletonKind = "dashboard" | "search" | "products" | "campaigns" | "reports" | "list" | "settings";

function Block({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export function ModuleSkeleton({ kind }: { kind: ModuleSkeletonKind }) {
  return (
    <div className="ds-container py-ds-24" aria-busy="true">
      <LoadingSpinner />
      <div className="mt-ds-16 flex flex-col gap-ds-12">
        <Block className="h-8 w-64 max-w-full" />
        <Block className="h-4 w-96 max-w-full" />
      </div>
      {kind === "dashboard" ? <DashboardSkeleton /> : null}
      {kind === "search" ? <SearchSkeleton /> : null}
      {kind === "products" || kind === "campaigns" ? <TableSkeleton /> : null}
      {kind === "reports" ? <ReportsSkeleton /> : null}
      {kind === "list" ? <ListSkeleton /> : null}
      {kind === "settings" ? <SettingsSkeleton /> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-ds-24 flex flex-col gap-ds-16">
      <div className="grid gap-ds-16 sm:grid-cols-2 xl:grid-cols-4">
        {["pesquisas", "products", "rascunhos", "acoes"].map((key) => (
          <Block key={key} className="h-24 w-full" />
        ))}
      </div>
      <ListSkeleton />
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="mt-ds-24 flex max-w-xl flex-col gap-ds-16">
      <Block className="h-10 w-full" />
      <Block className="h-10 w-full" />
      <Block className="h-10 w-40" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="mt-ds-24 flex flex-col gap-ds-8">
      <Block className="h-10 w-full" />
      {["a", "b", "c"].map((key) => (
        <Block key={key} className="h-12 w-full" />
      ))}
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="mt-ds-24 grid gap-ds-16 sm:grid-cols-3">
      {["visitas", "cliques", "compras"].map((key) => (
        <Block key={key} className="h-24 w-full" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-ds-24 flex flex-col gap-ds-12">
      {["a", "b", "c"].map((key) => (
        <Block key={key} className="h-14 w-full" />
      ))}
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="mt-ds-24 flex flex-col gap-ds-12">
      <Block className="h-10 w-full max-w-md" />
      <Block className="h-24 w-full" />
    </div>
  );
}
