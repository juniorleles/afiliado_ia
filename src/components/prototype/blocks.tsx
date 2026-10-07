import type { ReactNode } from "react";
import Link from "next/link";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { prototypeTechnical } from "@/lib/prototype/mock";

export function TechnicalDetails() {
  return (
    <Accordion type="single" collapsible className="mt-8">
      <AccordionItem value="technical">
        <AccordionTrigger>Ver detalhes técnicos</AccordionTrigger>
        <AccordionContent>
          <dl className="grid gap-2">
            {prototypeTechnical.map((row) => (
              <div key={row.label} className="flex flex-wrap justify-between gap-2">
                <dt>{row.label}</dt>
                <dd className="text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function PageIntro({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[24px] font-semibold leading-8 xl:text-[28px] xl:leading-9">{title}</h1>
        {lede ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-[#2430A8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-[#E4E7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </Link>
  );
}
