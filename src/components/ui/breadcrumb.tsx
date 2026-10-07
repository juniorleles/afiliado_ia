import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Trilha">
      <ol className="flex flex-wrap items-center gap-ds-8 text-caption">
        {items.flatMap((item, index) => {
          const last = index === items.length - 1;
          const crumb = (
            <li key={`${item.label}-${index}`}>
              {last || !item.href ? (
                <span className="text-foreground" aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="text-muted-foreground underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          );
          if (index === 0) return [crumb];
          return [
            <li key={`sep-${index}`} aria-hidden="true" className="text-muted-foreground">
              &gt;
            </li>,
            crumb,
          ];
        })}
      </ol>
    </nav>
  );
}
